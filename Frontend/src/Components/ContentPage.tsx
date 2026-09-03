import { useAppState } from '../Context/AppStateContext';
import ContentCard from './ContentCard';
import { useSelectedVideo } from '../Context/SelectedVideoContext';
import { Content, ContentType } from '../Models/types';
import { useScroll } from '../Context/ScrollContext';
import { useLayoutEffect, useRef, useState, useMemo, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FileUp, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { sendMessageToBackend } from '../Utils/MessageUtils';
import ContentFilters, { SortOption } from './ContentFilters';
import { useModal } from '../Context/ModalContext';
import Button from './Button';
import ConfirmationModal from './ConfirmationModal';
import { useWebSocketContext } from '../Context/WebSocketContext';

interface ContentPageProps {
  contentType: ContentType;
  contentTypes?: ContentType[];
  sectionId: string;
  title: string;
  Icon: LucideIcon;
  progressItems?: Record<string, any>; // For AI highlights or clipping progress
  isProgressVisible?: boolean;
  progressCardElement?: React.ReactNode; // Direct element instead of component
  favoriteFilter?: 'all' | 'favorites';
  onFavoriteFilterChange?: (filter: 'all' | 'favorites') => void;
}

export default function ContentPage({
  contentType,
  contentTypes,
  sectionId,
  title,
  Icon,
  progressItems = {},
  isProgressVisible = false,
  progressCardElement,
  favoriteFilter = 'all',
  onFavoriteFilterChange,
}: ContentPageProps) {
  const state = useAppState();
  const { setSelectedVideo } = useSelectedVideo();
  const { scrollPositions, setScrollPosition } = useScroll();
  const { isModalOpen, openModal, closeModal } = useModal();
  const { isConnected } = useWebSocketContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const isSettingScroll = useRef(false);
  const initialScrollPosition = useRef(
    sectionId === 'clips'
      ? scrollPositions.clips
      : sectionId === 'highlights'
        ? scrollPositions.highlights
        : sectionId === 'replayBuffer'
          ? scrollPositions.replayBuffer
          : sectionId === 'sessions'
            ? scrollPositions.sessions
            : 0,
  );

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  // Keyed on a primitive so the filtered list keeps a stable identity across renders.
  // Rebuilding it inline made every downstream useMemo (sorting, filtering, the selection
  // reconciliation effect) recompute on every render.
  const visibleTypesKey = (contentTypes ?? [contentType]).join(',');
  const contentItems = useMemo(() => {
    const types = visibleTypesKey.split(',') as ContentType[];
    return state.content.filter((video) => types.includes(video.type));
  }, [state.content, visibleTypesKey]);
  const [selectedGames, setSelectedGames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`${sectionId}-filters`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sortOption, setSortOption] = useState<SortOption>(() => {
    try {
      const saved = localStorage.getItem(`${sectionId}-sort`);
      return saved ? JSON.parse(saved) : 'newest';
    } catch {
      return 'newest';
    }
  });

  const uniqueGames = useMemo(() => {
    const games = contentItems.map((item) => item.game);
    const uniqueGameList = [...new Set(games)].sort();
    // Add "Imported" to the list if any items are imported
    if (contentItems.some((item) => item.isImported)) {
      return ['Imported', ...uniqueGameList];
    }
    return uniqueGameList;
  }, [contentItems]);

  const filteredItems = useMemo(() => {
    let filtered = [...contentItems];

    if (favoriteFilter === 'favorites') {
      filtered = filtered.filter((item) => item.isFavorite);
    }

    if (selectedGames.length > 0) {
      filtered = filtered.filter((item) => {
        if (selectedGames.includes('Imported') && item.isImported) {
          return true;
        }
        return selectedGames.filter((g) => g !== 'Imported').includes(item.game);
      });
    }

    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'size':
          return (b.fileSizeKb ?? 0) - (a.fileSizeKb ?? 0);
        case 'duration': {
          const toSecs = (dur: string) =>
            dur.split(':').reduce((acc, t) => 60 * acc + (parseInt(t, 10) || 0), 0);
          return toSecs(b.duration) - toSecs(a.duration);
        }
        case 'game': {
          const byGame = a.game.localeCompare(b.game);
          return byGame !== 0
            ? byGame
            : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [contentItems, selectedGames, sortOption, favoriteFilter]);

  const handleGameFilterChange = (games: string[]) => {
    setSelectedGames(games);
    localStorage.setItem(`${sectionId}-filters`, JSON.stringify(games));
  };

  const handleSortChange = (option: SortOption) => {
    setSortOption(option);
    localStorage.setItem(`${sectionId}-sort`, JSON.stringify(option));
  };

  const handleCardClick = useCallback(
    (video: Content) => {
      if (isCtrlPressed) {
        setSelectedItems((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(video.fileName)) {
            newSet.delete(video.fileName);
          } else {
            newSet.add(video.fileName);
          }
          return newSet;
        });
      } else {
        if (selectedItems.size === 0) {
          setSelectedVideo(video);
        } else {
          setSelectedItems(new Set());
        }
      }
    },
    [isCtrlPressed, selectedItems.size, setSelectedVideo],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedItems.size === 0 || !isConnected) return;

    const items = Array.from(selectedItems).map((fileName) => ({
      FileName: fileName,
      ContentType: state.content.find((item) => item.fileName === fileName)?.type ?? contentType,
    }));

    const count = items.length;
    openModal(
      <ConfirmationModal
        title={`Delete ${count} ${count === 1 ? 'file' : 'files'}?`}
        description="This permanently deletes the selected media files from disk. This action cannot be undone."
        confirmText="Delete permanently"
        cancelText="Cancel"
        onConfirm={() => {
          sendMessageToBackend('DeleteMultipleContent', { Items: items });
          setSelectedItems(new Set());
          closeModal();
        }}
        onCancel={closeModal}
      />,
    );
  }, [selectedItems, contentType, state.content, openModal, closeModal, isConnected]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Control') {
        setIsCtrlPressed(true);
      }

      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        if (selectedItems.size === filteredItems.length && filteredItems.length > 0) {
          setSelectedItems(new Set());
        } else {
          setSelectedItems(new Set(filteredItems.map((item) => item.fileName)));
        }
      }

      if (e.key === 'Escape') {
        setSelectedItems(new Set());
      }

      if (e.key === 'Delete' && selectedItems.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };

    // Always process the release, even behind a modal: otherwise opening one while
    // Ctrl is held leaves the flag stuck on and every later click toggles selection.
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(false);
      }
    };

    // The window never sees the keyup if focus leaves while Ctrl is held (alt-tab, or
    // the OS taking focus for the folder picker), so clear the flag on blur too.
    const handleBlur = () => setIsCtrlPressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [selectedItems, filteredItems, isModalOpen, handleDeleteSelected]);

  const prevContentFileNamesRef = useRef<string>('');

  useEffect(() => {
    const currentKey = contentItems.map((item) => item.fileName).join(',');

    if (currentKey === prevContentFileNamesRef.current) return;
    prevContentFileNamesRef.current = currentKey;

    const validFileNames = new Set(contentItems.map((item) => item.fileName));

    setSelectedItems((prev) => {
      let hasInvalid = false;
      prev.forEach((fileName) => {
        if (!validFileNames.has(fileName)) {
          hasInvalid = true;
        }
      });
      if (!hasInvalid) return prev; // Return same reference if nothing changed

      const newSet = new Set<string>();
      prev.forEach((fileName) => {
        if (validFileNames.has(fileName)) {
          newSet.add(fileName);
        }
      });
      return newSet;
    });
  }, [contentItems]);

  useLayoutEffect(() => {
    const position = initialScrollPosition.current;

    if (containerRef.current && position > 0) {
      isSettingScroll.current = true;
      containerRef.current.scrollTop = position;
      setTimeout(() => {
        isSettingScroll.current = false;
      }, 100);
    }
  }, []); // Only run on mount

  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = () => {
    if (containerRef.current && !isSettingScroll.current) {
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }

      scrollTimeout.current = setTimeout(() => {
        const currentPos = containerRef.current?.scrollTop;
        if (currentPos === undefined) return;

        const pageKey =
          sectionId === 'clips'
            ? 'clips'
            : sectionId === 'highlights'
              ? 'highlights'
              : sectionId === 'replayBuffer'
                ? 'replayBuffer'
                : sectionId === 'sessions'
                  ? 'sessions'
                  : null;

        if (pageKey) {
          setScrollPosition(pageKey, currentPos);
        }
      }, 500);
    }
  };

  const progressValues = Object.values(progressItems);
  const hasProgress = progressValues.length > 0;

  return (
    <div
      ref={containerRef}
      className="p-5 space-y-6 overflow-y-scroll h-full bg-base-200 overflow-x-hidden"
      onScroll={handleScroll}
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {sectionId === 'clips' && onFavoriteFilterChange && (
            <div className="join">
              <button
                className={`btn btn-sm join-item border-base-400 ${
                  favoriteFilter === 'all' ? 'btn-primary' : 'btn-secondary'
                }`}
                onClick={() => onFavoriteFilterChange('all')}
              >
                All
              </button>
              <button
                className={`btn btn-sm join-item border-base-400 ${
                  favoriteFilter === 'favorites' ? 'btn-primary' : 'btn-secondary'
                }`}
                onClick={() => onFavoriteFilterChange('favorites')}
              >
                Favorites
              </button>
            </div>
          )}
          {(sectionId === 'sessions' || sectionId === 'replayBuffer') && (
            <Button
              variant="primary"
              size="sm"
              className="no-animation h-8 gap-1"
              disabled={!isConnected}
              title={!isConnected ? 'Waiting for ScreenLoop to reconnect' : undefined}
              onClick={() => sendMessageToBackend('ImportFile', { sectionId })}
            >
              <FileUp size={16} />
              Import
            </Button>
          )}
          <ContentFilters
            uniqueGames={uniqueGames}
            onGameFilterChange={handleGameFilterChange}
            onSortChange={handleSortChange}
            sectionId={sectionId}
            selectedGames={selectedGames}
            sortOption={sortOption}
          />
        </div>
      </div>

      {contentItems.length > 0 || hasProgress ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {isProgressVisible && progressCardElement}

          {filteredItems.map((video) => (
            <ContentCard
              key={`${video.type}:${video.fileName}`}
              content={video}
              onClick={() => handleCardClick(video)}
              type={video.type}
              isSelected={selectedItems.has(video.fileName)}
              isSelectionMode={isCtrlPressed || selectedItems.size > 0}
            />
          ))}

          {filteredItems.length === 0 && !hasProgress && (
            <div className="col-span-full flex h-64 flex-col items-center justify-center text-gray-400">
              <Icon size={48} className="mb-3" />
              <p className="text-lg font-medium text-gray-200">No matching {title.toLowerCase()}</p>
              <p className="mt-1 text-sm">Clear the current filters to see all available items.</p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  handleGameFilterChange([]);
                  onFavoriteFilterChange?.('all');
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <Icon size={60} className="mb-4" />
          <p className="text-xl">No {title.toLowerCase()} found</p>
        </div>
      )}

      <AnimatePresence>
        {selectedItems.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-3 left-1/2 -translate-x-1/2 bg-base-300 border border-base-400 rounded-xl px-4 py-2 flex items-center gap-3 shadow-lg z-50"
          >
            <span className="text-sm text-gray-300">{selectedItems.size} Selected</span>
            <Button
              variant="danger"
              size="sm"
              className="h-8"
              disabled={!isConnected}
              title={!isConnected ? 'Waiting for ScreenLoop to reconnect' : undefined}
              onClick={handleDeleteSelected}
            >
              <Trash2 size={16} />
              Delete
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="h-8"
              onClick={() => setSelectedItems(new Set())}
            >
              Cancel
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
