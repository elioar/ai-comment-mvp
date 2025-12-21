'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface Comment {
  id: string;
  commentId: string;
  message: string;
  authorName: string;
  createdAt: string;
  status: string;
  postId: string;
  postMessage?: string;
  postImage?: string;
  postCreatedAt?: string;
  pageName?: string;
  provider?: string;
}

function CommentsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [newCommentsCount, setNewCommentsCount] = useState<number>(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [showNewCommentsNotification, setShowNewCommentsNotification] = useState(false);
  const [currentPageName, setCurrentPageName] = useState<string | null>(null);
  const [currentPageProvider, setCurrentPageProvider] = useState<string | null>(null);
  const [currentPageImage, setCurrentPageImage] = useState<string | null>(null);
  const [selectedPostForModal, setSelectedPostForModal] = useState<string | null>(null);
  const [refreshingTokens, setRefreshingTokens] = useState(false);
  const [availablePages, setAvailablePages] = useState<Array<{ id: string; name: string; provider: string; image?: string }>>([]);
  const [pageDropdownOpen, setPageDropdownOpen] = useState(false);
  const [processingCommentId, setProcessingCommentId] = useState<string | null>(null);
  const [backgroundFetching, setBackgroundFetching] = useState(false);
  const pageId = searchParams.get('pageId');
  const hasInitialFetch = useRef(false);
  const lastFetchedPageId = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCurrentLanguage(i18n.language || 'en');
    const handleLanguageChange = (lng: string) => {
      setCurrentLanguage(lng);
    };
    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch only connected pages for dropdown and profile images
  useEffect(() => {
    if (session) {
      const fetchPages = async () => {
        try {
          const response = await fetch('/api/facebook/pages');
          if (response.ok) {
            const data = await response.json();
            const connectedPagesList: Array<{ id: string; name: string; provider: string; image?: string }> = [];
            
            // Only use connected pages
            if (data.connectedPages && data.connectedPages.length > 0) {
              data.connectedPages.forEach((page: any) => {
                // Try to find the page image from pages or instagramPages
                let pageImage: string | null = null;
                
                if (page.provider === 'facebook' && data.pages) {
                  const fbPage = data.pages.find((p: any) => p.id === page.pageId);
                  if (fbPage) {
                    pageImage = fbPage.picture?.data?.url || null;
                  }
                } else if (page.provider === 'instagram' && data.instagramPages) {
                  const igPage = data.instagramPages.find((p: any) => p.id === page.pageId);
                  if (igPage) {
                    pageImage = igPage.profile_picture_url || null;
                  }
                }
                
                connectedPagesList.push({
                  id: page.pageId,
                  name: page.pageName,
                  provider: page.provider,
                  image: pageImage || undefined
                });
              });
            }
            
            setAvailablePages(connectedPagesList);
          }
        } catch (error) {
          console.error('Error fetching pages:', error);
        }
      };
      
      fetchPages();
    }
  }, [session]);

  // Auto-select first page if available and no pageId is selected
  useEffect(() => {
    if (!pageId && availablePages.length > 0 && session) {
      const firstPage = availablePages[0];
      router.push(`/dashboard/comments?pageId=${firstPage.id}`);
    }
  }, [availablePages, pageId, session, router]);

  useEffect(() => {
    if (session && pageId) {
      // Only fetch if:
      // 1. We haven't done initial fetch yet, OR
      // 2. The pageId has changed (user selected a different page)
      if (!hasInitialFetch.current || lastFetchedPageId.current !== pageId) {
        // Clear any existing polling when pageId changes
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setBackgroundFetching(false);
        
        // Clear old comments when pageId changes and show loading skeleton
        if (lastFetchedPageId.current !== null && lastFetchedPageId.current !== pageId) {
          setComments([]);
          setNewCommentsCount(0);
          setLastFetchedAt(null);
          setError(null);
          setWarning(null);
          setLoading(true); // Show skeleton during page change
        }
        
        hasInitialFetch.current = true;
        lastFetchedPageId.current = pageId;
        fetchComments();
      }
    }
    
    // Cleanup on unmount or pageId change
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [session, pageId]);

  const fetchComments = async () => {
    if (!pageId) return;
    
    // Show loading skeleton if we don't have comments yet
    if (comments.length === 0) {
      setLoading(true);
    }
    setError(null);
    setWarning(null);
    try {
      // Use background=true for instant response with cached comments
      const response = await fetch(`/api/facebook/comments?pageId=${pageId}&background=true`);
      if (response.ok) {
        const data = await response.json();
        // Always update comments - cached or fresh
        const newComments = data.comments || [];
        setComments(newComments);
        setLastFetchedAt(data.lastFetchedAt || null);
        setNewCommentsCount(data.newCommentsCount || 0);
        
        // Only hide loading if we got comments (even if cached)
        if (newComments.length > 0) {
          setLoading(false);
        }
        
        // Set current page info from first comment if available, or from availablePages if no comments
        if (data.comments && data.comments.length > 0) {
          setCurrentPageName(data.comments[0].pageName || null);
          setCurrentPageProvider(data.comments[0].provider || null);
        } else {
          // If no comments, try to get page info from availablePages
          const selectedPage = availablePages.find(p => p.id === pageId);
          if (selectedPage) {
            setCurrentPageName(selectedPage.name);
            setCurrentPageProvider(selectedPage.provider);
            setCurrentPageImage(selectedPage.image || null);
          }
        }
        
        // Also update page image if we have comments
        if (data.comments && data.comments.length > 0) {
          const selectedPage = availablePages.find(p => p.id === pageId);
          if (selectedPage) {
            setCurrentPageImage(selectedPage.image || null);
          }
        }
        
        // Handle Facebook permission error code 10 specifically
        if (data.error === 'FACEBOOK_PERMISSION_BLOCK') {
          setWarning(t('dashboard.comments.facebookPermissionBlock'));
          setError(null);
        } else if (data.error === 'FACEBOOK_PERMISSION_ERROR') {
          setWarning(t('dashboard.comments.facebookPermissionError'));
          setError(null);
        } else if (data.error) {
          setError(data.error);
        }
        if (data.warning) {
          setWarning(data.warning);
        }
        // Log debug info for troubleshooting
        if (data.debug) {
          console.log('[Comments] Debug info:', data.debug);
        }
        
        // Always start polling for updates (background fetch or not)
        // This ensures we catch new comments as they come in
        if (data.backgroundFetching && data.isCached) {
          setBackgroundFetching(true);
        } else {
          setBackgroundFetching(false);
        }
        
        // Start continuous polling for new comments
        pollForUpdates();
      } else {
        setError(t('dashboard.comments.failedToFetch'));
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
      setError(t('dashboard.comments.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  // Poll for updates continuously to check for new comments
  // This runs in the background and updates UI when new comments are found
  const pollForUpdates = async () => {
    // Clear any existing polling interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    pollIntervalRef.current = setInterval(async () => {
      if (!pageId) return;
      
      try {
        // Use background=true to trigger a new background fetch and get cached results
        const response = await fetch(`/api/facebook/comments?pageId=${pageId}&background=true`);
        if (response.ok) {
          const data = await response.json();
          
          // Get current comment IDs for comparison (use commentId, not database id)
          setComments(currentComments => {
            const currentCommentIds = new Set(currentComments.map(c => c.commentId));
            
            // Check if there are new comments
            const newComments = (data.comments || []).filter((c: Comment) => !currentCommentIds.has(c.commentId));
            
            if (newComments.length > 0) {
              // Show notification for new comments
              setShowNewCommentsNotification(true);
              setTimeout(() => setShowNewCommentsNotification(false), 5000);
              setNewCommentsCount(newComments.length);
            }
            
            // Always update if comments changed (new, deleted, or updated)
            if (data.comments.length !== currentComments.length || 
                JSON.stringify(data.comments.map((c: Comment) => c.commentId).sort()) !== 
                JSON.stringify(currentComments.map(c => c.commentId).sort())) {
              return data.comments || [];
            }
            
            return currentComments;
          });
          
          setLastFetchedAt(data.lastFetchedAt || null);
          
          // Update background fetching state
          if (data.backgroundFetching) {
            setBackgroundFetching(true);
          } else {
            setBackgroundFetching(false);
          }
        }
      } catch (error) {
        // Silent fail - continue polling
      }
    }, 5000); // Poll every 5 seconds for new comments
  };

  const refreshComments = async () => {
    if (!pageId) return;
    
    // Stop any background polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setBackgroundFetching(false);
    
    setFetching(true);
    setError(null);
    setWarning(null);
    setShowNewCommentsNotification(false);
    try {
      // Use sync mode (background=false) for manual refresh to get fresh data
      const response = await fetch(`/api/facebook/comments?pageId=${pageId}&background=false`);
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
        setLastFetchedAt(data.lastFetchedAt || null);
        const newCount = data.newCommentsCount || 0;
        setNewCommentsCount(newCount);
        
        // Set current page info from first comment if available, or from availablePages if no comments
        if (data.comments && data.comments.length > 0) {
          setCurrentPageName(data.comments[0].pageName || null);
          setCurrentPageProvider(data.comments[0].provider || null);
        } else {
          // If no comments, try to get page info from availablePages
          const selectedPage = availablePages.find(p => p.id === pageId);
          if (selectedPage) {
            setCurrentPageName(selectedPage.name);
            setCurrentPageProvider(selectedPage.provider);
            setCurrentPageImage(selectedPage.image || null);
          }
        }
        
        // Also update page image if we have comments
        if (data.comments && data.comments.length > 0) {
          const selectedPage = availablePages.find(p => p.id === pageId);
          if (selectedPage) {
            setCurrentPageImage(selectedPage.image || null);
          }
        }
        
        if (newCount > 0) {
          setShowNewCommentsNotification(true);
          // Hide notification after 5 seconds
          setTimeout(() => setShowNewCommentsNotification(false), 5000);
        }
        
        if (data.fetched) {
          // Show success message
          setError(null);
        }
        // Handle Facebook permission error code 10 specifically
        if (data.error === 'FACEBOOK_PERMISSION_BLOCK') {
          setWarning(t('dashboard.comments.facebookPermissionBlock'));
          setError(null);
        } else if (data.error === 'FACEBOOK_PERMISSION_ERROR') {
          setWarning(t('dashboard.comments.facebookPermissionError'));
          setError(null);
        } else if (data.error) {
          setError(data.error);
        }
        if (data.warning) {
          setWarning(data.warning);
        }
        // Log debug info for troubleshooting
        if (data.debug) {
          console.log('[Comments] Debug info:', data.debug);
        }
      } else {
        setError(t('dashboard.comments.failedToRefresh'));
      }
    } catch (error) {
      console.error('Error refreshing comments:', error);
      setError(t('dashboard.comments.errorRefreshing'));
    } finally {
      setFetching(false);
    }
  };

  const handleHide = async (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    
    const isCurrentlyHidden = comment.status === 'ignored';
    setProcessingCommentId(commentId);
    
    try {
      const response = await fetch(`/api/facebook/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isCurrentlyHidden ? 'unhide' : 'hide' }),
      });
      
      if (response.ok) {
        // Refresh comments to get updated status
        await refreshComments();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to hide comment');
      }
    } catch (error: any) {
      setError(error?.message || 'Failed to hide comment');
    } finally {
      setProcessingCommentId(null);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm(t('dashboard.comments.confirmDelete'))) return;
    
    setProcessingCommentId(commentId);
    
    try {
      const response = await fetch(`/api/facebook/comments/${commentId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Remove from local state immediately for better UX
        setComments(prev => prev.filter(c => c.id !== commentId));
        // Also refresh to ensure sync
        await refreshComments();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete comment');
      }
    } catch (error: any) {
      setError(error?.message || 'Failed to delete comment');
    } finally {
      setProcessingCommentId(null);
    }
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  const formatTimeAgo = (dateString: string | null): string => {
    if (!dateString) return t('dashboard.comments.never');
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return t('dashboard.comments.justNow');
    if (diffInSeconds < 3600) return t('dashboard.comments.minutesAgo', { count: Math.floor(diffInSeconds / 60) });
    if (diffInSeconds < 86400) return t('dashboard.comments.hoursAgo', { count: Math.floor(diffInSeconds / 3600) });
    return t('dashboard.comments.daysAgo', { count: Math.floor(diffInSeconds / 86400) });
  };

  const formatCommentDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return t('dashboard.comments.justNow');
    if (diffInSeconds < 3600) return t('dashboard.comments.minutesAgo', { count: Math.floor(diffInSeconds / 60) });
    if (diffInSeconds < 86400) return t('dashboard.comments.hoursAgo', { count: Math.floor(diffInSeconds / 3600) });
    if (diffInSeconds < 604800) return t('dashboard.comments.daysAgo', { count: Math.floor(diffInSeconds / 86400) });
    return date.toLocaleDateString(i18n.language === 'el' ? 'el-GR' : 'en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const menuItems = [
    {
      name: t('dashboard.menu.overview'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
        </svg>
      ),
      href: '/dashboard',
    },
    {
      name: t('dashboard.menu.pages'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      href: '/dashboard/pages',
    },
    {
      name: t('dashboard.menu.comments'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      href: '/dashboard/comments',
    },
    {
      name: t('dashboard.menu.analytics'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      href: '/dashboard/analytics',
    },
    {
      name: t('dashboard.menu.settings'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      href: '/dashboard/settings',
    },
  ];

  const ProfileDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);

    const handleLogout = async () => {
      await signOut({ redirect: false });
      router.push('/');
    };

    const userInitial = session?.user?.name?.charAt(0).toUpperCase() || 'U';

    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-all"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
            {userInitial}
          </div>
          <svg
            className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 py-1 z-20">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{session?.user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{session?.user?.email}</p>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 py-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>{t('dashboard.profile.logout')}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  if (status === 'loading' || !mounted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 w-64 h-screen transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-900`}
      >
        <div className="h-full flex flex-col">
          <div className="h-20 px-6 flex items-center border-b border-gray-200 dark:border-gray-900">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">AI Comments</span>
            </Link>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group text-sm ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Language Toggle */}
          <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-900">
            <div className="px-3 mb-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {t('dashboard.preferences.language')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                    currentLanguage === 'en' || currentLanguage.startsWith('en')
                      ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLanguage('el')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                    currentLanguage === 'el' || currentLanguage.startsWith('el')
                      ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'
                  }`}
                >
                  ΕΛ
                </button>
              </div>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-900">
            <div className="px-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {t('dashboard.preferences.theme')}
              </p>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg transition-all"
              >
                <div className="flex items-center gap-2">
                  {theme === 'light' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                  <span>{theme === 'light' ? t('dashboard.preferences.darkMode') : t('dashboard.preferences.lightMode')}</span>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-900">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-full flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                {session.user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{session.user.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{session.user.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <div className="lg:ml-64">
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
          <div className="h-16 sm:h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-4">
            {/* Left Section */}
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              {/* Page Selector */}
              {availablePages.length === 0 && !session ? (
                <div className="relative flex-1 min-w-0">
                  <div className="w-full sm:w-auto flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse"></div>
                    <div className="flex-1 min-w-0">
                      <div className="h-3 sm:h-4 w-24 sm:w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-1"></div>
                      <div className="h-2 sm:h-3 w-16 sm:w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                    </div>
                    <div className="w-4 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                  </div>
                </div>
              ) : availablePages.length > 0 ? (
                <div className="relative flex-1 min-w-0">
                  <button
                    onClick={() => setPageDropdownOpen(!pageDropdownOpen)}
                    className="group w-full sm:w-auto flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    {currentPageImage ? (
                      <img
                        src={currentPageImage}
                        alt={currentPageName || 'Select Page'}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        currentPageProvider === 'instagram'
                          ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500'
                          : 'bg-gradient-to-br from-blue-600 to-blue-700'
                      }`}>
                        {currentPageProvider === 'instagram' ? (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {currentPageName || t('dashboard.comments.selectPage') || 'Select a Page'}
                      </div>
                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                        {t('dashboard.menu.comments') || 'Comments'}
                      </div>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-all duration-200 flex-shrink-0 ${pageDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {/* Dropdown Menu */}
                  {pageDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-10 bg-black/20 sm:bg-transparent" 
                        onClick={() => setPageDropdownOpen(false)}
                      ></div>
                      <div className="fixed sm:absolute top-[72px] sm:top-[84px] left-1/2 sm:left-0 -translate-x-1/2 sm:translate-x-0 sm:translate-y-2 sm:mt-2 mt-0 w-[calc(100vw-32px)] sm:w-72 max-w-sm sm:max-w-none bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 z-20 max-h-[70vh] sm:max-h-80 overflow-y-auto custom-scrollbar backdrop-blur-xl">
                        {availablePages.map((page) => {
                          const isSelected = page.id === pageId;
                          return (
                            <button
                              key={page.id}
                              onClick={() => {
                                // Update page name, provider, and image immediately
                                setCurrentPageName(page.name);
                                setCurrentPageProvider(page.provider);
                                setCurrentPageImage(page.image || null);
                                setPageDropdownOpen(false);
                                router.push(`/dashboard/comments?pageId=${page.id}`);
                              }}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 sm:py-2 text-sm text-left transition-all duration-150 ${
                                isSelected 
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-medium' 
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                            >
                              {page.image ? (
                                <img
                                  src={page.image}
                                  alt={page.name}
                                  className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
                                />
                              ) : (
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  page.provider === 'instagram'
                                    ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500'
                                    : 'bg-gradient-to-br from-blue-600 to-blue-700'
                                }`}>
                                  {page.provider === 'instagram' ? (
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                    </svg>
                                  )}
                                </div>
                              )}
                              <div className="flex-1 min-w-0 flex items-center gap-2">
                                <span className="truncate text-sm font-medium">{page.name}</span>
                                {page.provider === 'instagram' ? (
                                  <svg className="w-4 h-4 text-pink-600 dark:text-pink-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                  </svg>
                                )}
                              </div>
                              {isSelected && (
                                <svg className="w-4 h-4 flex-shrink-0 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {!session ? (
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse"></div>
                  <div className="hidden sm:block">
                    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-1"></div>
                    <div className="h-2 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                  </div>
                </div>
              ) : (
                <ProfileDropdown />
              )}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-64px)] sm:min-h-[calc(100vh-80px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {/* Page Header Section */}
            <div className="mb-4 sm:mb-6 relative">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  {loading && !currentPageName ? (
                    <>
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 dark:bg-gray-800 rounded-xl sm:rounded-2xl animate-pulse flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="h-5 sm:h-6 lg:h-7 w-32 sm:w-40 lg:w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-200 dark:bg-gray-800 rounded-lg sm:rounded-xl animate-pulse"></div>
                        </div>
                        <div className="h-3 sm:h-4 w-24 sm:w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mt-1.5 sm:mt-2"></div>
                      </div>
                    </>
                  ) : currentPageName ? (
                    <>
                      {currentPageImage ? (
                        <img
                          src={currentPageImage}
                          alt={currentPageName}
                          className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl object-cover border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0"
                        />
                      ) : (
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                          currentPageProvider === 'instagram'
                            ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500'
                            : 'bg-gradient-to-br from-blue-600 to-blue-700'
                        }`}>
                          {currentPageProvider === 'instagram' ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-white truncate">
                            {currentPageName} {t('dashboard.comments.title') || 'Comments'}
                          </h2>
                          <button
                            onClick={refreshComments}
                            disabled={fetching}
                            className="group relative inline-flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 flex-shrink-0"
                          >
                            {fetching ? (
                              <svg className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <>
                                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {newCommentsCount > 0 && (
                                  <span className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 px-1 py-0.5 sm:px-1.5 sm:py-0.5 bg-blue-600 text-white text-[8px] sm:text-[10px] font-semibold rounded-full shadow-sm min-w-[16px] sm:min-w-[18px] text-center">
                                    {newCommentsCount}
                                  </span>
                                )}
                              </>
                            )}
                          </button>
                        </div>
                        {lastFetchedAt && (
                          <p className="text-[9px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                            {t('dashboard.comments.lastFetched')} {formatTimeAgo(lastFetchedAt)}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-white">
                          {t('dashboard.comments.title') || 'Comments'}
                        </h2>
                        <button
                          onClick={refreshComments}
                          disabled={fetching}
                          className="group relative inline-flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 flex-shrink-0"
                        >
                          {fetching ? (
                            <svg className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <>
                              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {newCommentsCount > 0 && (
                                <span className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 px-1 py-0.5 sm:px-1.5 sm:py-0.5 bg-blue-600 text-white text-[8px] sm:text-[10px] font-semibold rounded-full shadow-sm min-w-[16px] sm:min-w-[18px] text-center">
                                  {newCommentsCount}
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      </div>
                      {lastFetchedAt && (
                        <p className="text-[9px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                          {t('dashboard.comments.lastFetched')} {formatTimeAgo(lastFetchedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Stats Bar */}
              {comments.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4 text-xs sm:text-sm mt-3 sm:mt-4 px-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-gray-600 dark:text-gray-400">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="font-medium">{comments.length}</span>
                    <span className="hidden sm:inline">{t('dashboard.comments.totalComments')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-green-600 dark:text-green-400">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                    <span>
                      {comments.filter(c => c.status === 'replied').length} {t('dashboard.comments.replied')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {showNewCommentsNotification && newCommentsCount > 0 && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-green-800 dark:text-green-200 text-xs sm:text-sm font-medium truncate">
                    {t('dashboard.comments.fetchedSuccessfully', { count: newCommentsCount })}
                  </p>
                </div>
                <button
                  onClick={() => setShowNewCommentsNotification(false)}
                  className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 flex-shrink-0 p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {warning && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-yellow-800 dark:text-yellow-200 text-xs sm:text-sm truncate">{warning}</p>
                </div>
                <button
                  onClick={() => setWarning(null)}
                  className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 flex-shrink-0 p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {error && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-red-800 dark:text-red-200 text-xs sm:text-sm mb-2 sm:mb-3 break-words">{error}</p>
                    {error.includes('App Review') && (
                      <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-yellow-800 dark:text-yellow-200 text-xs font-medium mb-2">How to fix this:</p>
                        <ol className="text-yellow-700 dark:text-yellow-300 text-xs space-y-1 list-decimal list-inside">
                          <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="underline">Facebook Developer Console</a></li>
                          <li>Select your app → App Review → Permissions and Features</li>
                          <li>Find 'pages_read_engagement' and click "Request" or "Edit"</li>
                          <li>Submit your app for review with a clear use case (e.g., "Manage and respond to comments on Facebook Pages")</li>
                          <li>Wait for Facebook's approval (usually 1-7 business days)</li>
                          <li>After approval, users will need to reconnect their Facebook account</li>
                        </ol>
                        <p className="text-yellow-700 dark:text-yellow-300 text-xs mt-2">
                          <strong>Note:</strong> In development mode, only the app owner and test users can access permissions that require review.
                        </p>
                      </div>
                    )}
                  </div>
                  {error.includes('pages_read_engagement') && !error.includes('App Review') && (
                    <button
                      onClick={async () => {
                        setRefreshingTokens(true);
                        try {
                          const response = await fetch('/api/facebook/refresh-page-tokens', {
                            method: 'POST',
                          });
                          const data = await response.json();
                          if (response.ok) {
                            setWarning(`Refreshed ${data.refreshed} page tokens. ${data.verified} have the required permission.`);
                            if (data.errors && data.errors.length > 0) {
                              setError(data.errors.join('. '));
                            } else {
                              setError(null);
                              // Retry fetching comments
                              await refreshComments();
                            }
                          } else {
                            setError(data.error || 'Failed to refresh tokens');
                          }
                        } catch (err) {
                          setError('Failed to refresh page tokens. Please try again.');
                        } finally {
                          setRefreshingTokens(false);
                        }
                      }}
                      disabled={refreshingTokens}
                      className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {refreshingTokens ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Refreshing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Refresh Tokens</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {loading || (comments.length === 0 && !error) ? (
              <div className="space-y-3 sm:space-y-4 lg:space-y-5">
                {[...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className="group relative bg-white dark:bg-gray-900/50 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800/50 overflow-hidden"
                  >
                    <div className="p-3 sm:p-4 lg:p-6 relative">
                      <div className="flex items-start gap-2.5 sm:gap-3 lg:gap-4">
                        {/* Avatar Skeleton */}
                        <div className="flex-shrink-0">
                          <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-gray-200 dark:bg-gray-800 rounded-xl sm:rounded-2xl animate-pulse"></div>
                        </div>

                        {/* Content Skeleton */}
                        <div className="flex-1 min-w-0 pr-10 sm:pr-0">
                          {/* Header Skeleton */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1.5 sm:mb-2">
                            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 flex-wrap">
                              <div className="h-4 sm:h-5 lg:h-6 w-24 sm:w-32 lg:w-40 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                              <div className="h-3 sm:h-4 w-16 sm:w-20 lg:w-24 bg-gray-200 dark:bg-gray-800 rounded animate-pulse hidden sm:block"></div>
                            </div>
                            <div className="h-3 sm:h-4 w-20 sm:w-24 lg:w-28 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                          </div>

                          {/* Message Skeleton */}
                          <div className="space-y-2">
                            <div className="h-3 sm:h-4 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                            <div className="h-3 sm:h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                            <div className="h-3 sm:h-4 w-4/6 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Action Buttons Skeleton */}
                      <div className="absolute right-2 top-2 sm:right-4 sm:top-1/2 sm:-translate-y-1/2 lg:right-6 flex items-center gap-1 sm:gap-1.5 lg:gap-2">
                        <div className="flex items-center gap-0.5 sm:gap-1">
                          {[...Array(4)].map((_, i) => (
                            <div
                              key={i}
                              className="w-7 h-7 sm:w-8 sm:h-8 lg:w-9 lg:h-9 bg-gray-200 dark:bg-gray-800 rounded-lg sm:rounded-xl animate-pulse"
                            ></div>
                          ))}
                        </div>
                        <div className="w-12 sm:w-14 lg:w-16 h-5 sm:h-6 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !pageId && availablePages.length > 0 ? (
              <div className="bg-white dark:bg-gray-950 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 lg:p-12 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('dashboard.comments.selectPageToView') || 'Select a Page to View Comments'}</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 max-w-sm mx-auto px-2">
                  {t('dashboard.comments.selectPageDescription') || 'Choose a Facebook or Instagram page from the dropdown above to view and manage its comments'}
                </p>
              </div>
            ) : comments.length === 0 ? (
              <div className="bg-white dark:bg-gray-950 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 lg:p-12 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('dashboard.comments.noCommentsYet')}</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 max-w-sm mx-auto px-2">
                  {t('dashboard.comments.noCommentsDescription')}
                </p>
                <button
                  onClick={refreshComments}
                  className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-medium transition-all shadow-sm hover:shadow-md"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('dashboard.comments.refreshComments')}
                </button>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4 lg:space-y-5">
                {comments.map((comment) => {
                  return (
                    <div
                      key={comment.id}
                      className="group relative bg-white dark:bg-gray-900/50 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800/50 hover:border-gray-200 dark:hover:border-gray-700/50 hover:shadow-lg dark:hover:shadow-xl/10 transition-all duration-300 overflow-hidden"
                    >
                      <div className="p-3 sm:p-4 lg:p-6 relative">
                        <div className="flex items-start gap-2.5 sm:gap-3 lg:gap-4">
                          {/* Avatar - More Modern */}
                          <div className="flex-shrink-0">
                            <div className="relative">
                              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl sm:rounded-2xl flex items-center justify-center text-white font-bold text-xs sm:text-sm lg:text-base shadow-lg ring-2 ring-white/20 dark:ring-gray-800/50">
                                {comment.authorName.charAt(0).toUpperCase()}
                              </div>
                              {comment.status === 'replied' && (
                                <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-900"></div>
                              )}
                            </div>
                          </div>

                          {/* Content - Cleaner Layout */}
                          <div className="flex-1 min-w-0 pr-10 sm:pr-0">
                            {/* Header Row - Better Mobile Layout */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1.5 sm:mb-2">
                              <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 flex-wrap">
                                <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base lg:text-lg">
                                  {comment.authorName}
                                </h3>
                                {comment.pageName && (
                                  <>
                                    <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">•</span>
                                    <div className="flex items-center gap-1">
                                      {comment.provider === 'instagram' ? (
                                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-pink-500 dark:text-pink-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                        </svg>
                                      ) : (
                                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                        </svg>
                                      )}
                                      <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium truncate max-w-[80px] sm:max-w-[120px] lg:max-w-none">
                                        {comment.pageName}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 text-[10px] sm:text-xs lg:text-sm text-gray-400 dark:text-gray-500">
                                <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">•</span>
                                <span className="font-medium">{formatCommentDate(comment.createdAt)}</span>
                              </div>
                            </div>

                            {/* Comment Message - Better Typography */}
                            <p className="text-xs sm:text-sm lg:text-base text-gray-700 dark:text-gray-300 leading-relaxed sm:leading-relaxed whitespace-pre-wrap break-words font-normal">
                              {comment.message}
                            </p>
                          </div>
                        </div>
                        
                        {/* Action Buttons & Pending Badge - Desktop: Middle, Mobile: Top Right */}
                        <div className="absolute right-2 top-2 sm:right-4 sm:top-1/2 sm:-translate-y-1/2 lg:right-6 flex items-center gap-1 sm:gap-1.5 lg:gap-2">
                          {/* Action Buttons - Always visible */}
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            {/* Reply with AI */}
                            <button 
                              className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg sm:rounded-xl transition-all duration-200 active:scale-95 touch-manipulation"
                              title={t('dashboard.comments.replyWithAI')}
                            >
                              <svg className="w-4 h-4 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            </button>
                            
                            {/* View Post */}
                            {comment.postMessage && (
                              <button
                                onClick={() => setSelectedPostForModal(comment.id)}
                                className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg sm:rounded-xl transition-all duration-200 active:scale-95 touch-manipulation"
                                title={t('dashboard.comments.viewPost')}
                              >
                                <svg className="w-4 h-4 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                            )}
                            
                            {/* Hide */}
                            <button 
                              onClick={() => handleHide(comment.id)}
                              disabled={processingCommentId === comment.id}
                              className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg sm:rounded-xl transition-all duration-200 active:scale-95 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                              title={comment.status === 'ignored' ? t('dashboard.comments.unhide') : t('dashboard.comments.hide')}
                            >
                              {processingCommentId === comment.id ? (
                                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <svg className="w-4 h-4 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              )}
                            </button>
                            
                            {/* Delete */}
                            <button 
                              onClick={() => handleDelete(comment.id)}
                              disabled={processingCommentId === comment.id}
                              className="p-1.5 sm:p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg sm:rounded-xl transition-all duration-200 active:scale-95 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                              title={t('dashboard.comments.delete')}
                            >
                              {processingCommentId === comment.id ? (
                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <svg className="w-4 h-4 sm:w-4 sm:h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              )}
                            </button>
                          </div>
                          
                          {/* Pending Badge - Last */}
                          {comment.status === 'pending' && (
                            <div className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-700 text-white rounded-full text-[9px] sm:text-xs font-semibold shadow-lg backdrop-blur-sm">
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse"></div>
                              <span className="hidden sm:inline">{t('dashboard.comments.pending')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Post Modal */}
      {(() => {
        const modalComment = selectedPostForModal ? comments.find(c => c.id === selectedPostForModal) : null;
        
        if (!modalComment || !modalComment.postMessage) return null;
        
        return (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedPostForModal(null)}
          >
            <div 
              className="bg-white dark:bg-gray-950 rounded-lg sm:rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 max-w-2xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
                    {modalComment.provider === 'instagram' ? (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">{modalComment.pageName}</h3>
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{t('dashboard.comments.originalPost')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPostForModal(null)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors flex-shrink-0 ml-2"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 custom-scrollbar">
                {/* Post Image */}
                {modalComment.postImage && (
                  <div className="mb-3 sm:mb-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 flex items-center justify-center max-h-[200px] sm:max-h-[250px] md:max-h-[300px]">
                    <img 
                      src={modalComment.postImage} 
                      alt={t('dashboard.comments.originalPost')}
                      className="w-full h-full object-contain max-h-[200px] sm:max-h-[250px] md:max-h-[300px]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                {/* Post Date */}
                {modalComment.postCreatedAt && (
                  <div className="mb-3 sm:mb-4 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="break-words">
                      {new Date(modalComment.postCreatedAt).toLocaleDateString(i18n.language || 'en', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                )}
                
                {/* Post Message */}
                {modalComment.postMessage && (
                  <div className="prose prose-xs sm:prose-sm dark:prose-invert max-w-none">
                    <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                      {modalComment.postMessage}
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  <span>{t('dashboard.comments.commentBy')} {modalComment.authorName}</span>
                </div>
                <button
                  onClick={() => setSelectedPostForModal(null)}
                  className="w-full sm:w-auto px-4 py-2 bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                >
                  {t('dashboard.comments.close')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function CommentsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading...</p>
          </div>
        </div>
      }
    >
      <CommentsPageContent />
    </Suspense>
  );
}

