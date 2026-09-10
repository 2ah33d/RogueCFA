import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Calendar from './ui/calendar';

/**
 * HistoryBrowser.jsx — Smooth Framer Motion dropdown calendar menu.
 * Continuous rounded-2xl box with zero scrollbars and exact site aesthetics.
 */
export default function HistoryBrowser({ selectedDate, onSelectDigest, className = '' }) {
  const [history, setHistory] = useState([]);
  const [audioDates, setAudioDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchHistory = () => {
    fetch('/api/marketcall-history?limit=30')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.history)) {
          setHistory(data.history);
        }
        if (data && Array.isArray(data.availableAudioDates)) {
          setAudioDates(data.availableAudioDates);
        }
      })
      .catch((err) => {
        console.warn('[HistoryBrowser] Failed to load digest history:', err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    setLoading(true);
    fetchHistory();
  }, [selectedDate]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  /* Close dropdown when clicking outside */
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleCalendarDateSelect = (dateStr) => {
    setIsOpen(false);
    const existing = history.find((h) => h.episodeDate === dateStr);
    if (existing) {
      if (onSelectDigest) onSelectDigest(existing);
    } else {
      if (onSelectDigest) {
        onSelectDigest({
          id: `custom-${dateStr}`,
          episodeDate: dateStr,
          isCustomDate: true,
          digest: null,
        });
      }
    }
  };

  if (loading && history.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-dim font-sans py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-dim animate-ping" />
        <span>Loading history...</span>
      </div>
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const historyList = [...(history || [])];

  /* If todayStr is not in history list, prepend a placeholder trigger item */
  if (!historyList.some((h) => h.episodeDate === selectedDate || h.episodeDate === todayStr)) {
    historyList.unshift({
      id: `today-trigger-${todayStr}`,
      episodeDate: todayStr,
      isTodayTrigger: true,
      digest: {
        guest: "Check / Generate Today's Episode",
        picks: [],
      },
    });
  }

  const currentSelection = historyList.find((h) => h.episodeDate === selectedDate) || historyList[0];
  const displayDate = selectedDate || (currentSelection ? currentSelection.episodeDate : 'Latest Episode');
  const savedDateStrings = historyList.map((h) => h.episodeDate);

  const hasPendingAudio = audioDates.some((ad) => !history.some((h) => h.episodeDate === ad && h.digest));

  return (
    <div ref={dropdownRef} className={`relative text-xs font-sans ${className}`}>
      {/* Dropdown Toggle Pill - Clean surface-card background with NO white outline */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 px-3.5 inline-flex items-center gap-2 bg-surface-card hover:bg-surface-elevated rounded-full text-xs font-medium text-prime shadow-antigravity transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer group"
        title={hasPendingAudio ? "Newer episode audio ready to generate" : undefined}
      >
        {hasPendingAudio && (
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shrink-0" title="Audio ready to generate" />
        )}
        <span className="text-xs font-semibold text-prime">{displayDate}</span>
        <span className="text-xs text-dim font-normal">· {history.length} Saved</span>
        <svg
          className="w-3 h-3 text-dim group-hover:text-prime transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Animated Dropdown Menu - Continuous rounded-2xl card without scrollbars */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute left-0 mt-2 z-50 rounded-2xl shadow-antigravity-elevated overflow-hidden font-sans"
          >
            <Calendar
              selectedDate={selectedDate || todayStr}
              onDateSelect={handleCalendarDateSelect}
              savedDates={savedDateStrings}
              audioDates={audioDates}
              className="border-surface-card/90"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
