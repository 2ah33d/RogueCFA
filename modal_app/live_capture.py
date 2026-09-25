import os
import re
import datetime
import subprocess
import requests
import modal

# Define lightweight Debian image with FFmpeg, requests, and streamlink installed (CPU-only, $0.086/hr)
app_image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install("requests", "streamlink")
)

app = modal.App("roguecfa-live-capture")

PRIMARY_STREAM_URL = os.environ.get("BNN_LIVE_STREAM_URL") or "https://playerservices.streamtheworld.com/api/livestream-redirect/TV_BNN_ADP.m3u8"
FALLBACK_STREAM_URLS = [
    "https://playerservices.streamtheworld.com/api/livestream-redirect/TV_BNN_ADP.aac",
    "https://playerservices.streamtheworld.com/api/livestream-redirect/TV_BNNAAC.aac",
    "https://playerservices.streamtheworld.com/api/livestream-redirect/TV_BNNAAC.m3u8",
]

def resolve_and_verify_stream(url: str) -> str:
    """Follow HTTP 302 redirects to find and verify the active live edge server node (e.g. 18153, 29313)."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.bnnbloomberg.ca/"
        }
        res = requests.get(url, headers=headers, allow_redirects=True, timeout=12)
        if res.status_code == 200 and res.url:
            print(f"Resolved & verified live stream: {url} -> {res.url} (Status: {res.status_code})")
            return res.url
        else:
            print(f"Candidate {url} resolved to dead/forbidden node {res.url} (HTTP {res.status_code}). Skipping.")
            return None
    except Exception as err:
        print(f"Warning: Stream resolution failed for {url}: {err}")
    return None

@app.function(
    image=app_image,
    # Runs Mon-Fri at 11:59 AM EST / 8:59 AM PST (captures 12:00 PM - 1:00 PM EST live broadcast)
    schedule=modal.Cron("59 11 * * 1-5", timezone="America/New_York"),
    timeout=3900,  # 65 minutes max execution time
    secrets=[modal.Secret.from_name("roguecfa-secrets")],
    nonpreemptible=True,  # Dedicated instance prevents cloud eviction mid-broadcast
    retries=0,            # Never blindly retry/restart live capture after broadcast ends
)
def run_live_capture(duration_secs: int = 3660, target_date: str = None, skip_rss: bool = True, is_test: bool = False):
    stream_url = PRIMARY_STREAM_URL
    webhook_url = os.environ.get("VERCEL_WEBHOOK_URL", "https://roguecfa.vercel.app/api/ingest")
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", "")
    api_secret = os.environ.get("API_SECRET") or os.environ.get("CRON_SECRET")
    
    if not api_secret:
        raise RuntimeError("Neither API_SECRET nor CRON_SECRET is set in modal.Secret('roguecfa-secrets')")
    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in modal.Secret('roguecfa-secrets')")

    eastern_tz = None
    now_et = None
    try:
        import zoneinfo
        eastern_tz = zoneinfo.ZoneInfo("America/New_York")
        now_et = datetime.datetime.now(eastern_tz)
    except Exception:
        pass

    if target_date and re.match(r"^\d{4}-\d{2}-\d{2}$", target_date):
        today_str = target_date
    else:
        if now_et is not None:
            today_dt = now_et.date()
            if now_et.hour < 11:
                today_dt -= datetime.timedelta(days=1)
            if today_dt.weekday() == 5: # Saturday -> Friday
                today_dt -= datetime.timedelta(days=1)
            elif today_dt.weekday() == 6: # Sunday -> Friday
                today_dt -= datetime.timedelta(days=2)
            today_str = today_dt.strftime("%Y-%m-%d")
        else:
            today_str = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=5)).strftime("%Y-%m-%d")

    # Broadcast Ceiling Guard: Market Call strictly airs 12:00 PM - 1:00 PM Eastern Time.
    # We allow a 1-minute buffer (13:01:00 ET). Any live stream capture MUST strictly end by 1:01 PM ET.
    capture_duration = duration_secs
    if not is_test and now_et is not None:
        target_end_et = now_et.replace(hour=13, minute=1, second=0, microsecond=0)
        seconds_until_end = int((target_end_et - now_et).total_seconds())

        if seconds_until_end <= 0:
            raise RuntimeError(
                f"Market Call broadcast for {today_str} has already ended at 1:00 PM ET "
                f"(current time: {now_et.strftime('%H:%M:%S')} ET). "
                f"Aborting live capture to prevent recording subsequent programming (Trading Day)."
            )

        if seconds_until_end < 900:  # Less than 15 minutes remaining
            raise RuntimeError(
                f"Insufficient broadcast time remaining ({seconds_until_end}s / {seconds_until_end // 60}m left before 1:01 PM ET). "
                f"Market Call caller segment has already concluded. Aborting to prevent recording subsequent programming."
            )

        capture_duration = min(duration_secs, seconds_until_end)
        print(f"Wall-clock guard: Current ET is {now_et.strftime('%H:%M:%S')}. "
              f"Clamping capture duration to {capture_duration}s (ends at {target_end_et.strftime('%H:%M:%S')} ET).")
    elif is_test:
        print(f"Test mode active: Capturing exactly {capture_duration}s (wall-clock ceiling bypassed).")

    raw_filename = f"test_raw_{today_str}.m4a" if is_test else "raw_marketcall.m4a"
    compressed_filename = f"test-marketcall-{today_str}.m4a" if is_test else f"marketcall-{today_str}.m4a"

    print(f"=== Beginning Modal CPU Live Capture for date: {today_str} (skip_rss={skip_rss}, is_test={is_test}) ===")

    capture_success = False

    # Attempt 1 (PRIMARY): Download official BNN Market Call broadcast audio feed from RSS (searches up to 100 episodes)
    if not skip_rss:
        try:
            rss_url = "https://www.omnycontent.com/d/playlist/4809bc8a-e41a-405c-93da-a8cf011df2f4/fcfd42e4-d5c6-4b4a-8c62-ae32016f1b9a/4ecaf48c-23a4-4f5e-84b3-ae3201711923/podcast.rss"
            rss_res = requests.get(rss_url, timeout=15)
            
            items = re.findall(r'<item>([\s\S]*?)</item>', rss_res.text)
            selected_audio_url = None
            selected_title = None

            for item in items:
                title_m = re.search(r'<title>([^<]+)</title>', item)
                enc_m = re.search(r'<enclosure[^>]+url=["\']([^"\']+)["\']', item)
                
                if enc_m:
                    url = enc_m.group(1).replace("&amp;", "&")
                    title = title_m.group(1) if title_m else ""
                    
                    if today_str:
                        if today_str in item or today_str in title:
                            selected_audio_url = url
                            selected_title = title
                            break
                        
                        title_date_m = re.search(r'\(([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})\)', title)
                        if title_date_m:
                            raw_title_date = title_date_m.group(1).replace('.', '')
                            for fmt in ("%B %d, %Y", "%b %d, %Y"):
                                try:
                                    parsed_dt = datetime.datetime.strptime(raw_title_date, fmt)
                                    if parsed_dt.strftime("%Y-%m-%d") == today_str:
                                        selected_audio_url = url
                                        selected_title = title
                                        break
                                except Exception:
                                    pass
                            if selected_audio_url:
                                break
                    else:
                        selected_audio_url = url
                        selected_title = title
                        break

            if selected_audio_url:
                print(f"Downloading BNN Market Call audio from RSS feed ({selected_title or today_str}): {selected_audio_url}")
                dl_res = requests.get(selected_audio_url, timeout=120)
                with open(raw_filename, "wb") as f:
                    f.write(dl_res.content)
                capture_success = True
            else:
                raise Exception(f"No audio enclosure matching date {today_str} found in RSS feed")
        except Exception as rss_err:
            print(f"Primary RSS audio download failed: {rss_err}. Trying secondary Streamlink live stream capture fallback...")

    # Attempt 2 (FALLBACK): Direct stream capture via Streamlink / FFmpeg
    # Track wall-clock start so we can budget remaining time for FFmpeg fallback
    import time as _time
    _capture_start = _time.monotonic()
    MODAL_TIMEOUT = 3900  # Must match the @app.function timeout above
    SAFETY_MARGIN = 180   # Reserve 3 min for compression + upload

    if not capture_success:
        candidate_urls = [PRIMARY_STREAM_URL] + [u for u in FALLBACK_STREAM_URLS if u != PRIMARY_STREAM_URL]
        min_bytes_expected = 50_000 if is_test else 1_000_000

        for candidate_url in candidate_urls:
            if capture_success:
                break

            resolved_url = resolve_and_verify_stream(candidate_url)
            if not resolved_url:
                print(f"Skipping candidate {candidate_url} — edge node verification failed.")
                continue

            print(f"Attempting capture with stream candidate: {candidate_url} (resolved to {resolved_url})")

            # 2a: Try Streamlink if candidate resolves to HLS (.m3u8)
            if ".m3u8" in resolved_url:
                target_stream_url = resolved_url
                if not target_stream_url.startswith("hls://"):
                    target_stream_url = f"hls://{target_stream_url}"

                print(f"Attempting live stream capture via Streamlink ({target_stream_url}) for {capture_duration}s...")
                streamlink_cmd = [
                    "streamlink",
                    "--http-header", "Referer=https://www.bnnbloomberg.ca/",
                    "--http-header", "User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    target_stream_url,
                    "best",
                    "-o", raw_filename
                ]
                try:
                    subprocess.run(streamlink_cmd, timeout=capture_duration + 15, check=True)
                    if os.path.isfile(raw_filename) and os.path.getsize(raw_filename) > min_bytes_expected:
                        file_mb = os.path.getsize(raw_filename) / (1024 * 1024)
                        print(f"Streamlink capture succeeded ({file_mb:.1f} MB).")
                        capture_success = True
                except subprocess.TimeoutExpired:
                    if os.path.isfile(raw_filename) and os.path.getsize(raw_filename) > min_bytes_expected:
                        file_mb = os.path.getsize(raw_filename) / (1024 * 1024)
                        print(f"Streamlink timed out as expected after {capture_duration}s. "
                              f"Output file exists ({file_mb:.1f} MB) — treating as successful capture.")
                        capture_success = True
                    else:
                        print("Streamlink timed out but output file is missing or too small. "
                              "Falling back to FFmpeg...")
                except Exception as streamlink_err:
                    print(f"Streamlink capture failed ({streamlink_err}). Attempting direct FFmpeg capture fallback...")

            # 2b: Direct FFmpeg capture fallback (works for both HLS .m3u8 and raw continuous .aac streams)
            if not capture_success:
                seconds_left_in_broadcast = 3600
                if not is_test and eastern_tz is not None:
                    now_fallback_et = datetime.datetime.now(eastern_tz)
                    target_end_fallback_et = now_fallback_et.replace(hour=13, minute=1, second=0, microsecond=0)
                    seconds_left_in_broadcast = int((target_end_fallback_et - now_fallback_et).total_seconds())
                    if seconds_left_in_broadcast < 180:
                        raise RuntimeError(
                            f"Market Call broadcast has concluded (current time: {now_fallback_et.strftime('%H:%M:%S')} ET). "
                            f"Aborting FFmpeg fallback to prevent capturing subsequent programming."
                        )

                elapsed = _time.monotonic() - _capture_start
                remaining = MODAL_TIMEOUT - elapsed - SAFETY_MARGIN
                if remaining < 60:
                    raise RuntimeError(
                        f"Not enough time remaining for FFmpeg fallback "
                        f"({remaining:.0f}s left). Streamlink consumed {elapsed:.0f}s."
                    )
                ffmpeg_duration = min(int(remaining), capture_duration, seconds_left_in_broadcast)
                print(f"Attempting direct FFmpeg capture ({ffmpeg_duration}s budget, target={resolved_url})...")
                try:
                    ffmpeg_cmd = [
                        "ffmpeg", "-y",
                        "-headers", "Referer: https://www.bnnbloomberg.ca/\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n",
                        "-i", resolved_url,
                        "-t", str(ffmpeg_duration),
                        "-vn", "-c:a", "aac", raw_filename
                    ]
                    subprocess.run(ffmpeg_cmd, timeout=ffmpeg_duration + 30, check=True)
                    if os.path.isfile(raw_filename) and os.path.getsize(raw_filename) > min_bytes_expected:
                        file_mb = os.path.getsize(raw_filename) / (1024 * 1024)
                        print(f"FFmpeg capture succeeded ({file_mb:.1f} MB).")
                        capture_success = True
                except Exception as ffmpeg_err:
                    print(f"FFmpeg capture attempt failed for {resolved_url}: {ffmpeg_err}")

        if not capture_success:
            raise RuntimeError("All Streamlink and direct FFmpeg live capture candidates failed.")

    # Step 2: Compress audio with FFmpeg to 48kbps mono AAC (~21.6 MB for 1 hour)
    print("Compressing captured audio to 48kbps mono AAC (~21 MB target size)...")
    compress_cmd = [
        "ffmpeg", "-y",
        "-i", raw_filename,
        "-vn",
        "-c:a", "aac",
        "-b:a", "48k",
        "-ac", "1",
        compressed_filename
    ]
    subprocess.run(compress_cmd, check=True)

    file_size_mb = os.path.getsize(compressed_filename) / (1024 * 1024)
    print(f"Audio compressed successfully. Final size: {file_size_mb:.2f} MB (Groq API compatible < 25MB)")

    # Step 3: Upload compressed audio file to Supabase Storage bucket 'marketcall-audio'
    bucket_name = "marketcall-audio"
    storage_upload_url = f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket_name}/{compressed_filename}"
    
    print(f"Uploading {compressed_filename} to Supabase Storage bucket '{bucket_name}'...")
    with open(compressed_filename, "rb") as f:
        upload_res = requests.post(
            storage_upload_url,
            headers={
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "audio/mp4",
                "x-upsert": "true",
            },
            data=f,
            timeout=120
        )
    
    if upload_res.status_code not in (200, 201):
        raise RuntimeError(f"Failed to upload audio to Supabase Storage: {upload_res.status_code} - {upload_res.text}")

    public_audio_url = f"{supabase_url.rstrip('/')}/storage/v1/object/public/{bucket_name}/{compressed_filename}"
    print(f"Supabase Storage Upload complete! Public URL: {public_audio_url}")

    # Step 4: Prune Supabase Storage audio files older than 7 calendar days (accumulates rolling 5 broadcast days, ~115 MB total)
    try:
        print(f"Checking '{bucket_name}' bucket for files older than 7 days (rolling 5 broadcast day window)...")
        list_url = f"{supabase_url.rstrip('/')}/storage/v1/object/list/{bucket_name}"
        list_res = requests.post(
            list_url,
            headers={
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
            },
            json={"prefix": "", "limit": 100},
            timeout=15
        )
        if list_res.ok:
            objects = list_res.json()
            cutoff_date = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)).strftime("%Y-%m-%d")
            to_delete = []
            for obj in objects:
                name = obj.get("name", "")
                m = re.search(r"marketcall-(\d{4}-\d{2}-\d{2})\.m4a", name)
                if m:
                    file_date = m.group(1)
                    if file_date < cutoff_date:
                        to_delete.append(name)
            
            if to_delete:
                print(f"Pruning {len(to_delete)} old audio files older than {cutoff_date}: {to_delete}")
                delete_url = f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket_name}"
                requests.delete(
                    delete_url,
                    headers={
                        "Authorization": f"Bearer {supabase_key}",
                        "Content-Type": "application/json",
                    },
                    json={"prefixes": to_delete},
                    timeout=15
                )
                print("Pruning complete.")
    except Exception as prune_err:
        print(f"Warning: Audio pruning failed (non-critical): {prune_err}")

    # Step 5: Webhook notification to Vercel endpoint
    if is_test:
        print("=== TEST MODE COMPLETE ===")
        print("Bypassing Vercel webhook so test audio is NOT ingested into production.")
        print(f"Public audio URL: {public_audio_url}")
        return {
            "status": "success",
            "is_test": True,
            "filename": compressed_filename,
            "duration_secs": capture_duration,
            "file_size_mb": round(file_size_mb, 2),
            "public_audio_url": public_audio_url
        }

    print("POSTing audio capture notification to Vercel API...")
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            response = requests.post(
                webhook_url,
                json={
                    "show": "Market Call",
                    "episodeDate": today_str,
                    "audioUrl": public_audio_url,
                    "audioSizeMb": round(file_size_mb, 2),
                    "source": "modal_live_audio"
                },
                headers={"Authorization": f"Bearer {api_secret}"},
                timeout=60
            )
            response.raise_for_status()
            print(f"Vercel webhook responded with status {response.status_code}")
            break
        except Exception as err:
            print(f"Webhook attempt {attempt} failed: {err}")
            import time
            time.sleep(3)


@app.function(
    image=app_image,
    # Runs Mon-Fri at 1:30 PM, 2:30 PM, 3:30 PM, 4:30 PM, 5:30 PM, 6:30 PM EST after live broadcast finishes
    schedule=modal.Cron("30 13,14,15,16,17,18 * * 1-5", timezone="America/New_York"),
    timeout=300,
    secrets=[modal.Secret.from_name("roguecfa-secrets")]
)
def check_and_purge_rss():
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", "")
    bucket_name = "marketcall-audio"

    if not supabase_url or not supabase_key:
        print("Missing Supabase credentials, skipping check_and_purge_rss.")
        return

    # 1. List files in marketcall-audio bucket
    list_url = f"{supabase_url.rstrip('/')}/storage/v1/object/list/{bucket_name}"
    try:
        list_res = requests.post(
            list_url,
            headers={
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
            },
            json={"prefix": "", "limit": 100},
            timeout=15
        )
        if not list_res.ok:
            print(f"Failed to list Supabase bucket: {list_res.status_code}")
            return
        objects = list_res.json()
    except Exception as e:
        print(f"Error checking Supabase storage: {e}")
        return

    if not objects:
        print("Supabase Storage is empty (0 MB). No live audio files to purge.")
        return

    # 2. Fetch OmnyStudio RSS feed
    rss_url = "https://www.omnycontent.com/d/playlist/4809bc8a-e41a-405c-93da-a8cf011df2f4/fcfd42e4-d5c6-4b4a-8c62-ae32016f1b9a/4ecaf48c-23a4-4f5e-84b3-ae3201711923/podcast.rss"
    try:
        rss_res = requests.get(rss_url, timeout=15)
        items = re.findall(r'<item>([\s\S]*?)</item>', rss_res.text)
    except Exception as rss_err:
        print(f"Failed to fetch RSS feed: {rss_err}")
        return

    for obj in objects:
        name = obj.get("name", "")
        m = re.search(r"marketcall-(\d{4}-\d{2}-\d{2})\.m4a", name)
        if not m:
            continue
        
        file_date = m.group(1)
        rss_mp3_url = None
        rss_title = None

        for item in items:
            title_m = re.search(r'<title>([^<]+)</title>', item)
            enc_m = re.search(r'<enclosure[^>]+url=["\']([^"\']+)["\']', item)
            if enc_m:
                url = enc_m.group(1).replace("&amp;", "&")
                title = title_m.group(1) if title_m else ""
                if file_date in item or file_date in title:
                    rss_mp3_url = url
                    rss_title = title
                    break
                title_date_m = re.search(r'\(([A-Za-z]+\.?\s+\d{1,2},\s+\d{4})\)', title)
                if title_date_m:
                    raw_title_date = title_date_m.group(1).replace('.', '')
                    for fmt in ("%B %d, %Y", "%b %d, %Y"):
                        try:
                            parsed_dt = datetime.datetime.strptime(raw_title_date, fmt)
                            if parsed_dt.strftime("%Y-%m-%d") == file_date:
                                rss_mp3_url = url
                                rss_title = title
                                break
                        except Exception:
                            pass
                    if rss_mp3_url:
                        break

        if rss_mp3_url:
            print(f"RSS podcast match found for {file_date}: {rss_title}")
            # Update digest_jobs in Supabase DB for audio-DATE and live-DATE
            for job_prefix in ["audio-", "live-"]:
                job_id = f"{job_prefix}{file_date}"
                get_url = f"{supabase_url.rstrip('/')}/rest/v1/digest_jobs?id=eq.{job_id}"
                get_res = requests.get(
                    get_url,
                    headers={"Authorization": f"Bearer {supabase_key}", "apikey": supabase_key}
                )
                if get_res.ok and get_res.json():
                    row = get_res.json()[0]
                    res_obj = row.get("result") or {}
                    res_obj["audioUrl"] = rss_mp3_url
                    res_obj["source"] = "rss_podcast_swapped"
                    res_obj["swappedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    
                    patch_url = f"{supabase_url.rstrip('/')}/rest/v1/digest_jobs?id=eq.{job_id}"
                    requests.patch(
                        patch_url,
                        headers={
                            "Authorization": f"Bearer {supabase_key}",
                            "apikey": supabase_key,
                            "Content-Type": "application/json",
                            "Prefer": "return=minimal"
                        },
                        json={"result": res_obj, "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
                    )
                    print(f"Updated digest_jobs row '{job_id}' audioUrl to RSS MP3.")

            # Note: Do not immediately purge .m4a from Supabase Storage.
            # Retain audio up to the rolling 7-day window so users can generate day-accurate digests
            # for up to 5 days if they check in late during the week.
            print(f"Retaining live audio '{name}' in Supabase Storage (managed by 7-day rolling pruning window).")


@app.local_entrypoint()
def main(duration: int = 600, test: bool = True):
    print(f"Triggering live capture test on Modal (duration={duration}s, is_test={test})...")
    res = run_live_capture.remote(duration_secs=duration, is_test=test)
    print("\n================ CAPTURE RESULT ================")
    print(f"Status: {res.get('status')}")
    print(f"Filename: {res.get('filename')}")
    print(f"Duration: {res.get('duration_secs')}s")
    print(f"File Size: {res.get('file_size_mb')} MB")
    print(f"Audio URL: {res.get('public_audio_url')}")
    print("================================================\n")


