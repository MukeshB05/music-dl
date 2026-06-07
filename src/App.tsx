import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SearchBar from './components/SearchBar';
import TrackCard from './components/TrackCard';
import TrackSkeleton from './components/TrackSkeleton';
import SearchResults from './components/SearchResults';
import type { SaavnSong, SearchResult } from './types/saavn';
import { searchSongs } from './utils/search';

// ─── Constants ────────────────────────────────────────────────────────────────

const SONG_API = 'https://dreamly.mukeshlive.workers.dev';

// ─── View states ──────────────────────────────────────────────────────────────

type View =
  | { type: 'idle' }
  | { type: 'fetching' }
  | { type: 'track'; song: SaavnSong; fromSearch: boolean }
  | { type: 'searching'; query: string }
  | { type: 'results'; results: SearchResult[]; query: string }
  | { type: 'fetchingResult'; results: SearchResult[]; query: string; fetchingId: string }
  | { type: 'error'; message: string; context: 'url' | 'search' };

// ─── Fetch helper ─────────────────────────────────────────────────────────────

interface UpdateItem {
  id: string;
  title: string;
  date: string;
  content: string;
}

async function fetchSong(url: string): Promise<SaavnSong> {
  const apiUrl = `${SONG_API}/song?url=${encodeURIComponent(url)}`;
  const resp = await fetch(apiUrl);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `HTTP ${resp.status}`);
  }
  const data: SaavnSong = await resp.json();
  if (!data?.id || !data?.more_info?.encrypted_media_url) {
    throw new Error('Invalid response from API — missing required fields');
  }
  return data;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>({ type: 'idle' });
  const [searchError, setSearchError] = useState('');
  const [showUpdates, setShowUpdates] = useState(false);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);

  // Persist last search so "Back to results" restores it without re-fetching
  const lastSearch = useRef<{ results: SearchResult[]; query: string } | null>(null);
  useEffect(() => {
  fetch('/updates.json')
    .then((res) => res.json())
    .then(setUpdates)
    .catch(console.error);
}, []);

  // ── URL fetch ────────────────────────────────────────────────────────────

  const handleUrlFetch = useCallback(async (url: string) => {
    setView({ type: 'fetching' });
    setSearchError('');
    try {
      const song = await fetchSong(url);
      setView({ type: 'track', song, fromSearch: false });
    } catch (err) {
      setView({
        type: 'error',
        message: err instanceof Error ? err.message : 'Fetch failed',
        context: 'url',
      });
    }
  }, []);

  // ── Search ──────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (query: string) => {
    setView({ type: 'searching', query });
    setSearchError('');
    try {
      const results = await searchSongs(query);
      lastSearch.current = { results, query };
      setView({ type: 'results', results, query });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setView({ type: 'error', message: err instanceof Error ? err.message : 'Search failed', context: 'search' });
    }
  }, []);

  // ── Result click → re-fetch full song via perma_url ─────────────────────

  const handleResultSelect = useCallback(async (result: SearchResult) => {
    const currentQuery =
      view.type === 'results' || view.type === 'fetchingResult' ? view.query : '';
    const currentResults =
      view.type === 'results'
        ? view.results
        : view.type === 'fetchingResult'
        ? view.results
        : [];

    setView({
      type: 'fetchingResult',
      results: currentResults,
      query: currentQuery,
      fetchingId: result.id,
    });
    setSearchError('');

    try {
      const song = await fetchSong(result.perma_url);
      setView({ type: 'track', song, fromSearch: true });
    } catch (err) {
      // Restore results panel and show inline error
      const msg = err instanceof Error ? err.message : 'Failed to load song';
      setSearchError(msg);
      setView({ type: 'results', results: currentResults, query: currentQuery });
    }
  }, [view]);

  // ── Back to results ──────────────────────────────────────────────────────

  const goBackToResults = () => {
    setSearchError('');
    if (lastSearch.current) {
      setView({
        type: 'results',
        results: lastSearch.current.results,
        query: lastSearch.current.query,
      });
    } else {
      setView({ type: 'idle' });
    }
  };

  // ── Derived flags ────────────────────────────────────────────────────────

  const isUrlLoading  = view.type === 'fetching';
  const isSearching   = view.type === 'searching';
  const isAnyLoading  = isUrlLoading || isSearching || view.type === 'fetchingResult';
  const fromSearch    = view.type === 'track' && view.fromSearch;

  const showSearch =
    view.type === 'searching' ||
    view.type === 'results' ||
    view.type === 'fetchingResult' ||
    (view.type === 'error' && view.context === 'search');

  const showTrack     = view.type === 'track';
  const showUrlError  = view.type === 'error' && view.context === 'url';

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-void relative overflow-x-hidden">

      {/* ── Ambient background ─────────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-mesh-cyan" />
        <div className="absolute inset-0 bg-mesh-rose" />
        <div
          className="absolute inset-0 opacity-[0.012]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),' +
              'linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* ── Page ───────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-10 sm:py-16">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-8 text-center"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
           
            <h1 className="text-2xl font-display font-bold text-text-primary tracking-tight">
              Dreamly5<span className="text-cyan">-DL</span>
            </h1>
          </div>
          <p className="text-[13px] text-white/60 font-body">
            Search results are fetched from jiosaavn.com · Downloading up to{' '}
            <span className="text-cyan font-mono">320kbps with album song image</span>
          </p>
        </motion.div>

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-2xl"
        >
          <SearchBar
            onUrlFetch={handleUrlFetch}
            onSearch={handleSearch}
            isLoading={isAnyLoading}
          />
        </motion.div>

        {/* Content area */}
        <div className="w-full max-w-2xl mt-6">
          <AnimatePresence mode="wait">

            {/* URL fetching skeleton */}
            {isUrlLoading && (
              <motion.div
                key="fetch-skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <TrackSkeleton />
              </motion.div>
            )}

            {/* URL / generic fetch error */}
            {showUrlError && view.type === 'error' && (
              <FetchError key="url-error" message={view.message} />
            )}

            {/* Track card */}
            {showTrack && view.type === 'track' && (
              <motion.div
                key={`track-${view.song.id}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Back to results — only when arrived from search */}
                {fromSearch && (
                  <motion.button
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={goBackToResults}
                    className="mb-3 flex items-center gap-1.5 text-[12px] font-mono text-text-muted hover:text-violet-400 transition-colors group"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:-translate-x-0.5 transition-transform">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    Back to results
                  </motion.button>
                )}
                <TrackCard song={view.song} />
              </motion.div>
            )}

            {/* Search results / searching / result-fetch loading */}
            {showSearch && (
              <motion.div
                key="search-panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Inline error from result re-fetch */}
                <AnimatePresence>
                  {searchError && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-rose/20 bg-rose/5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff6b8a" strokeWidth="2" className="flex-shrink-0">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <p className="text-[11px] font-mono text-rose/80">{searchError}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <SearchResults
                  results={
                    view.type === 'results' || view.type === 'fetchingResult'
                      ? view.results
                      : []
                  }
                  query={
                    view.type === 'searching'        ? view.query
                    : view.type === 'results'        ? view.query
                    : view.type === 'fetchingResult' ? view.query
                    : view.type === 'error'          ? ''
                    : ''
                  }
                  isSearching={isSearching}
                  fetchingId={view.type === 'fetchingResult' ? view.fetchingId : null}
                  onSelect={handleResultSelect}
                  error={view.type === 'error' && view.context === 'search' ? view.message : ''}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer */}
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.8 }}
  className="mt-auto pt-16 flex items-center justify-center gap-4"
>
{/* Updates / Info */}
<button
  onClick={() => setShowUpdates(true)}
  className="relative w-10 h-10 rounded-full bg-glass border border-border flex items-center justify-center text-text-muted hover:text-cyan hover:border-cyan/30 hover:bg-cyan/10 transition-all duration-200"
  aria-label="Updates"
>

  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
</button>
{/* Updates Modal */}
{showUpdates && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/80 backdrop-blur-xl p-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold text-text-primary">
          Updates
        </h2>

        <button
          onClick={() => setShowUpdates(false)}
          className="text-text-muted hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {updates.map((update: UpdateItem) => (
          <div
            key={update.id}
            className="rounded-2xl border border-border bg-glass p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text-primary">
                {update.title}
              </p>

              <span className="text-[10px] font-mono text-cyan/80">
                {update.date}
              </span>
            </div>

            <p className="mt-1 text-xs text-white/90">
              {update.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  </div>
)}
</motion.div>

      </div>
    </div>
  );
}

// ─── Inline error card ────────────────────────────────────────────────────────

function FetchError({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-2xl border border-rose/20 bg-rose/5 p-5 flex items-start gap-3"
    >
      <div className="w-8 h-8 rounded-lg bg-rose/10 border border-rose/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff6b8a" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div>
        <p className="text-sm font-display font-semibold text-rose">Failed to fetch song</p>
        <p className="text-xs font-mono text-rose/70 mt-0.5">{message}</p>
      </div>
    </motion.div>
  );
}
