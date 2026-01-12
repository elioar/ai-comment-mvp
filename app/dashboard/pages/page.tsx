'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  provider?: string;
}

interface InstagramPage {
  id: string;
  username: string;
  name: string;
  profile_picture_url?: string;
  access_token: string;
  facebook_page_id: string;
  provider?: string;
}

interface ConnectedPage {
  id: string;
  pageId: string;
  pageName: string;
  provider: string;
  createdAt: string;
  pageAccessToken?: string;
  adAccountId?: string | null;
}

interface AdAccount {
  id: string;
  accountId: string;
  name: string;
  currency?: string;
  timezone?: string;
  businessName?: string;
  status?: string;
}

export default function PagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [instagramPages, setInstagramPages] = useState<InstagramPage[]>([]);
  const [connectedPages, setConnectedPages] = useState<ConnectedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasNoActiveAccount, setHasNoActiveAccount] = useState(false);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false);
  const [updatingAdAccount, setUpdatingAdAccount] = useState<string | null>(null);
  const [expandedAdAccountPage, setExpandedAdAccountPage] = useState<string | null>(null);
  const [editingAdAccountValue, setEditingAdAccountValue] = useState<string>('');
  const [useManualAdAccount, setUseManualAdAccount] = useState<boolean>(false);
  const [showAddPageDropdown, setShowAddPageDropdown] = useState<'facebook' | 'instagram' | null>(null);
  const [pageToDisconnect, setPageToDisconnect] = useState<{ pageId: string; provider: string; pageName: string } | null>(null);
  const hasHandledOAuth = useRef(false);
  const isFetching = useRef(false);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitialFetch = useRef(false);

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

  // Fetch ad accounts when connected pages are loaded (Facebook or Instagram)
  useEffect(() => {
    const hasConnectedPages = connectedPages.length > 0;
    if (hasConnectedPages && adAccounts.length === 0 && !loadingAdAccounts) {
      fetchAdAccounts();
    }
  }, [connectedPages]);

  useEffect(() => {
    if (session && !hasInitialFetch.current) {
      const handleOAuthCallback = async () => {
        // Check if we just came back from Facebook OAuth (indicated by #_=_ hash)
        const hasOAuthHash = window.location.hash === '#_=_';
        
        if (hasOAuthHash && !hasHandledOAuth.current) {
          hasHandledOAuth.current = true;
          
          // Clean up Facebook redirect hash
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          // Refresh the router to trigger session refresh (non-blocking)
          router.refresh();
          
          // Fetch immediately - no delays
          fetchData(true, true);
          hasInitialFetch.current = true;
        } else if (!hasHandledOAuth.current) {
          // Fetch immediately on initial load - no delays
          fetchData(true, true);
          hasInitialFetch.current = true;
        }
      };
      
      handleOAuthCallback();
    }
  }, [session]);

  const performFetch = async (showLoading = true) => {
    if (isFetching.current) {
      return;
    }

    isFetching.current = true;
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    
    try {
      const response = await fetch('/api/facebook/pages');
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        setError('Failed to fetch pages');
        return;
      }
      
      // Always set connected pages FIRST and immediately (they're stored in DB)
      // This allows UI to show them right away
      if (data.connectedPages && Array.isArray(data.connectedPages)) {
        setConnectedPages(data.connectedPages);
      }
      
      // Set pages and Instagram pages
      setPages(data.pages || []);
      setInstagramPages(data.instagramPages || []);
      
      // Hide loading as soon as we have data (especially connected pages)
      if (showLoading) {
        setLoading(false);
      }
      
      if (response.ok) {
        // Handle rate limit errors gracefully
        if (data.rateLimited) {
          // Rate limit is temporary - show info message but don't block the UI
          // Connected pages from database are still available
          if (data.connectedPages && data.connectedPages.length > 0) {
            // Don't show error if we have connected pages - they still work
            setError(null);
          } else {
            setError(data.error || 'Facebook API rate limit reached. Please try again in a few minutes.');
          }
        } else if (data.error) {
          // Only show error if there are no connected pages to display
          if (!data.connectedPages || data.connectedPages.length === 0) {
            setError(data.error);
          } else {
            // We have connected pages, so don't show error
            setError(null);
          }
        }
      } else {
        // Only show error if we have no connected pages to display
        if (!data.connectedPages || data.connectedPages.length === 0) {
          setError(data.error || 'Failed to fetch pages');
        } else {
          // We have connected pages, so don't show error
          setError(null);
        }
      }
      
      // Check if there's no active Facebook account (no pages returned even though we tried to fetch)
      // This helps determine if we should show the connect button
      const noActiveAccount = (data.pages?.length === 0 && data.instagramPages?.length === 0) && 
                              (data.error?.includes('No Facebook account') || 
                               data.error?.includes('Facebook token') ||
                               data.error?.includes('token is invalid'));
      setHasNoActiveAccount(noActiveAccount);
    } catch (error) {
      // Don't set error if we have connected pages - they might still work
      setError('Error loading pages');
      if (showLoading) {
        setLoading(false);
      }
    } finally {
      isFetching.current = false;
    }
  };

  const fetchData = async (force = false, showLoading = true) => {
    // Prevent multiple simultaneous fetches
    if (isFetching.current && !force) {
      return;
    }

    // Clear any pending timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }

    // Debounce rapid calls (but not for initial load or forced fetches)
    if (!force) {
      fetchTimeoutRef.current = setTimeout(() => {
        fetchTimeoutRef.current = null;
        performFetch(showLoading);
      }, 100);
      return;
    }

    performFetch(showLoading);
  };

  const fetchAdAccounts = async () => {
    if (loadingAdAccounts) return;
    
    setLoadingAdAccounts(true);
    try {
      const response = await fetch('/api/facebook/ad-accounts');
      const data = await response.json();
      
      if (response.ok && data.adAccounts) {
        setAdAccounts(data.adAccounts);
      } else {
      }
    } catch (error) {
    } finally {
      setLoadingAdAccounts(false);
    }
  };

  // Helper function to get ad account name by ID
  const getAdAccountName = (adAccountId: string | null | undefined): string => {
    if (!adAccountId) return '';
    
    const normalizedStored = adAccountId.replace(/^act_/i, '').trim();
    const matchingAccount = adAccounts.find(acc => {
      const normalizedAccId = acc.accountId.replace(/^act_/i, '').trim();
      return normalizedAccId === normalizedStored;
    });
    
    return matchingAccount ? matchingAccount.name : adAccountId;
  };

  // Helper function to get ad account ID value for dropdown
  const getAdAccountIdForDropdown = (adAccountId: string | null | undefined): string => {
    if (!adAccountId) return '';
    
    const normalizedStored = adAccountId.replace(/^act_/i, '').trim();
    const matchingAccount = adAccounts.find(acc => {
      const normalizedAccId = acc.accountId.replace(/^act_/i, '').trim();
      return normalizedAccId === normalizedStored;
    });
    
    return matchingAccount ? matchingAccount.accountId : `act_${adAccountId}`;
  };

  const updateAdAccount = async (pageId: string, adAccountIdOrFullId: string | null, provider: string) => {
    setUpdatingAdAccount(pageId);
    setError(null);
    try {
      // Normalize the ad account ID: remove 'act_' prefix if present (for API/database storage)
      let normalizedAdAccountId: string | null = null;
      if (adAccountIdOrFullId) {
        normalizedAdAccountId = adAccountIdOrFullId.replace(/^act_/i, '').trim();
        if (normalizedAdAccountId === '') {
          normalizedAdAccountId = null;
        }
      }
      
      const response = await fetch('/api/facebook/pages', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pageId,
          adAccountId: normalizedAdAccountId,
          provider,
        }),
      });

      const responseData = await response.json();

      if (response.ok) {
        // Update the connected page in state
        setConnectedPages(prev => prev.map(page => 
          page.pageId === pageId && page.provider === provider
            ? { ...page, adAccountId: responseData.page?.adAccountId || null }
            : page
        ));
        setExpandedAdAccountPage(null);
      } else {
        setError(responseData.error || 'Failed to update ad account');
      }
    } catch (error) {
      setError('Error updating ad account');
    } finally {
      setUpdatingAdAccount(null);
    }
  };

  const connectPage = async (page: FacebookPage | InstagramPage, provider: 'facebook' | 'instagram' = 'facebook') => {
    setConnecting(page.id);
    setError(null);
    
    console.log(`🔗 [Connect Page] Starting connection for ${provider} page:`, {
      pageId: page.id,
      pageName: provider === 'instagram' ? (page as InstagramPage).username || (page as InstagramPage).name : (page as FacebookPage).name,
      provider
    });
    
    try {
      // Determine page name based on provider type
      let pageName: string;
      if (provider === 'instagram' && 'username' in page) {
        const instagramPage = page as InstagramPage;
        pageName = instagramPage.username || instagramPage.name;
      } else {
        const facebookPage = page as FacebookPage;
        pageName = facebookPage.name;
      }
      
      const requestBody: any = {
        pageId: page.id,
        pageName: pageName,
        pageAccessToken: page.access_token,
        provider: provider,
      };
      
      // For Instagram pages, include the Facebook Page ID if available
      if (provider === 'instagram' && 'facebook_page_id' in page) {
        requestBody.facebookPageId = (page as InstagramPage).facebook_page_id;
      }
      
      console.log(`🔗 [Connect Page] Sending POST request to /api/facebook/pages`);
      
      const response = await fetch('/api/facebook/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();
      
      console.log(`🔗 [Connect Page] Response received:`, {
        ok: response.ok,
        status: response.status,
        hasPage: !!responseData.page,
        adAccountId: responseData.page?.adAccountId || null,
        error: responseData.error || null
      });

      if (response.ok) {
        // Fetch ad accounts when a new page is connected (so they're available for editing)
        if (adAccounts.length === 0 && !loadingAdAccounts) {
          console.log(`🔗 [Connect Page] Fetching ad accounts (none loaded yet)`);
          fetchAdAccounts();
        }
        
        // Optimistically update the state immediately with the newly connected page
        if (responseData.page) {
          const newConnectedPage = {
            id: responseData.page.id,
            pageId: responseData.page.pageId,
            pageName: responseData.page.pageName,
            provider: responseData.page.provider,
            createdAt: responseData.page.createdAt,
            adAccountId: responseData.page.adAccountId || null,
          };
          
          console.log(`✅ [Connect Page] Page connected successfully:`, {
            pageId: newConnectedPage.pageId,
            pageName: newConnectedPage.pageName,
            provider: newConnectedPage.provider,
            adAccountId: newConnectedPage.adAccountId || 'No Ad Account'
          });
          
          // Add to connected pages list if not already there
          setConnectedPages(prev => {
            const exists = prev.some(p => p.pageId === newConnectedPage.pageId && p.provider === newConnectedPage.provider);
            if (exists) {
              // Update existing page
              return prev.map(p => 
                p.pageId === newConnectedPage.pageId && p.provider === newConnectedPage.provider
                  ? newConnectedPage
                  : p
              );
            } else {
              // Add new page
              return [...prev, newConnectedPage];
            }
          });
        }
        
        // Force fetch after connection to get fresh data (cache is cleared server-side)
        console.log(`🔗 [Connect Page] Refreshing page data...`);
        await fetchData(true, false); // Force fetch after connection, no loading spinner
        console.log(`✅ [Connect Page] Connection complete!`);
      } else {
        console.error(`❌ [Connect Page] Connection failed:`, responseData.error || responseData.details || 'Unknown error');
        setError(responseData.error || responseData.details || 'Failed to connect page');
      }
    } catch (error) {
      console.error(`❌ [Connect Page] Error connecting page:`, error);
      setError('Error connecting page');
    } finally {
      setConnecting(null);
    }
  };

  const disconnectPage = async (pageId: string, provider: string = 'facebook') => {
    setDisconnecting(pageId);
    setError(null);
    try {
      const response = await fetch(`/api/facebook/pages?pageId=${pageId}&provider=${provider}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Optimistically remove the page from the connected pages list immediately
        setConnectedPages(prev => prev.filter(p => !(p.pageId === pageId && p.provider === provider)));
        
        // Force fetch after disconnection to get fresh data (cache is cleared server-side)
        await fetchData(true, false); // Force fetch after disconnection, no loading spinner
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to disconnect page');
      }
    } catch (error) {
      setError('Error disconnecting page');
    } finally {
      setDisconnecting(null);
    }
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
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

      const isPageConnected = (pageId: string, provider: string = 'facebook') => {
        return connectedPages.some((cp) => cp.pageId === pageId && cp.provider === provider);
      };

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
        <header className="sticky top-0 z-20 h-20 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-900">
          <div className="h-full px-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('dashboard.menu.pages') || 'Connected Pages'}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-80px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {error && (
              <div className={`mb-6 p-4 border rounded-lg ${
                error.includes('rate limit') || error.includes('Rate limit')
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-start gap-3">
                  {error.includes('rate limit') || error.includes('Rate limit') ? (
                    <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      error.includes('rate limit') || error.includes('Rate limit')
                        ? 'text-yellow-800 dark:text-yellow-200'
                        : 'text-red-800 dark:text-red-200'
                    }`}>
                      {error}
                    </p>
                    {error.includes('rate limit') || error.includes('Rate limit') ? (
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                        This is temporary. Your connected pages are still available and working. The limit will reset automatically in a few minutes.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                  {t('dashboard.pages.loadingPages', 'Loading pages...')}
                </p>
              </div>
                ) : pages.length === 0 && instagramPages.length === 0 && connectedPages.length === 0 ? (
              <div className="max-w-2xl mx-auto">
                <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center shadow-sm">
                  <div className="mb-6">
                    <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                          {t('dashboard.pages.connectYourFacebookInstagram', 'Connect Your Facebook & Instagram Pages')}
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                          {t('dashboard.pages.description')}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                          {t('dashboard.pages.adminAccessRequired', 'Make sure you have admin access to the Facebook pages and Instagram Business accounts you want to connect.')}
                        </p>
                  </div>
                  <button
                    onClick={async () => {
                      // Store current user ID before OAuth so we can link Facebook to this account
                      if (session?.user?.id) {
                        try {
                          await fetch('/api/auth/set-linking-user', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: session.user.id }),
                          });
                        } catch (error) {
                          // Still continue with OAuth even if storing fails
                        }
                      }
                      await signIn('facebook', { callbackUrl: '/dashboard/pages' });
                    }}
                    className="inline-flex items-center gap-3 px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-base shadow-md hover:shadow-lg"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    {t('dashboard.pages.connectFacebookAccount', 'Connect Facebook Account')}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                    {t('dashboard.pages.accountWillBeLinked', 'Your Facebook account will be linked to your current account ({{email}})', { email: session?.user?.email })}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {t('dashboard.pages.yourPages', 'Your Pages')}
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('dashboard.pages.description')}
                    </p>
                  </div>
                  
                  {/* Connect Facebook & Instagram Button */}
                  {hasNoActiveAccount && (
                    <button
                      onClick={async () => {
                        // Store current user ID before OAuth so we can link Facebook to this account
                        if (session?.user?.id) {
                          try {
                            await fetch('/api/auth/set-linking-user', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: session.user.id }),
                            });
                          } catch (error) {
                            // Still continue with OAuth even if storing fails
                          }
                        }
                        await signIn('facebook', { callbackUrl: '/dashboard/pages' });
                      }}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-pink-600 hover:from-blue-700 hover:to-pink-700 text-white rounded-lg transition-all font-medium text-sm shadow-md hover:shadow-lg"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      <span>{t('dashboard.pages.connectFacebookInstagram', 'Connect Facebook & Instagram')}</span>
                    </button>
                  )}
                </div>

                {/* Show connect button if no active account, even if there are connected pages */}
                {hasNoActiveAccount && (
                  <div className="mb-6 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                            {t('dashboard.pages.facebookAccountDisconnected', 'Facebook Account Disconnected')}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('dashboard.pages.reconnectToManage', 'Reconnect your Facebook account to manage your pages and fetch comments.')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          // Check if Facebook is configured before attempting OAuth
                          try {
                            const configCheck = await fetch('/api/auth/check-facebook-config');
                            
                            if (!configCheck.ok) {
                              // Continue anyway - let NextAuth handle the error
                            } else {
                              const config = await configCheck.json();
                              
                              if (!config.configured) {
                                const missing = [];
                                if (!config.details.hasClientId) missing.push('FACEBOOK_CLIENT_ID');
                                if (!config.details.hasClientSecret) missing.push('FACEBOOK_CLIENT_SECRET');
                                if (!config.details.hasNextAuthUrl) missing.push('NEXTAUTH_URL');
                                if (!config.details.hasNextAuthSecret) missing.push('NEXTAUTH_SECRET');
                                
                                alert(`Facebook OAuth is not configured. Missing environment variables:\n\n${missing.map(key => `- ${key}: ${config.required[key]}`).join('\n')}\n\nPlease add these to your Vercel environment variables and redeploy.`);
                                return;
                              }
                            }
                          } catch (error) {
                            // Continue anyway - let NextAuth handle the error
                            // The server-side check will catch any real configuration issues
                          }

                          // Store current user ID before OAuth so we can link Facebook to this account
                          if (session?.user?.id) {
                            try {
                              await fetch('/api/auth/set-linking-user', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: session.user.id }),
                              });
                            } catch (error) {
                              // Still continue with OAuth even if storing fails
                            }
                          }
                          
                          try {
                            await signIn('facebook', { callbackUrl: '/dashboard/pages' });
                          } catch (error: any) {
                            alert(`Failed to connect Facebook: ${error?.message || 'Unknown error'}. Please check your Facebook App configuration.`);
                          }
                        }}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm shadow-md hover:shadow-lg"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        {t('dashboard.pages.connectFacebookInstagram', 'Connect Facebook & Instagram')}
                      </button>
                    </div>
                  </div>
                )}

                {(pages.length > 0 || instagramPages.length > 0 || connectedPages.length > 0) && (
                  <div>
                    {/* Show Connected Pages Even Without Active Facebook Account */}
                    {connectedPages.length > 0 && pages.length === 0 && instagramPages.length === 0 && (
                      <div className="mb-6">
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-6">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                              {t('dashboard.pages.connectedPagesWarning', 'You have {{count}} connected page(s), but your Facebook account is disconnected. Reconnect to manage them.', { count: connectedPages.length })}
                            </p>
                          </div>
                        </div>
                        
                        {/* Display Connected Pages */}
                        <div className="space-y-4">
                          <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('dashboard.pages.selectPageToViewComments', 'Select a Page to View Comments')}</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.pages.chooseConnectedPage', 'Choose a connected Facebook or Instagram page to view and manage its comments')}</p>
                          </div>
                          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('dashboard.pages.connectedPages', 'Connected Pages')}</h3>
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {connectedPages.map((connectedPage) => (
                              <div
                                key={`connected-${connectedPage.pageId}-${connectedPage.provider}`}
                                className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6"
                              >
                                <div className="flex items-center gap-3 mb-4">
                                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                    connectedPage.provider === 'instagram'
                                      ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500'
                                      : 'bg-blue-600'
                                  }`}>
                                    {connectedPage.provider === 'instagram' ? (
                                      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                      </svg>
                                    ) : (
                                      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate">
                                      {connectedPage.pageName}
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                      {connectedPage.provider === 'instagram' ? 'Instagram Account' : 'Facebook Page'}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                                      {t('dashboard.pages.disconnected', 'Disconnected')}
                                    </span>
                                    <Link
                                      href={`/dashboard/comments?pageId=${connectedPage.pageId}`}
                                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-medium text-sm whitespace-nowrap shadow-sm hover:shadow-md"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                      </svg>
                                      {t('dashboard.pages.viewComments', 'View Comments')}
                                    </Link>
                                  </div>
                                  
                                  {/* Ad Account Display for Facebook and Instagram pages */}
                                  {(connectedPage.adAccountId || expandedAdAccountPage === connectedPage.pageId) && (
                                    <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                                      {expandedAdAccountPage === connectedPage.pageId ? (
                                        <div className="space-y-2">
                                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                            </svg>
                                            <span className="font-medium">{t('dashboard.pages.adAccount', 'Ad Account:')}</span>
                                          </div>
                                          <select
                                            value={editingAdAccountValue}
                                            onChange={(e) => setEditingAdAccountValue(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            disabled={updatingAdAccount === connectedPage.pageId}
                                          >
                                            <option value="">{t('dashboard.pages.noAdAccount', 'No Ad Account')}</option>
                                            {adAccounts.map((account) => (
                                              <option key={account.id} value={account.accountId}>
                                                {account.name} ({account.accountId})
                                              </option>
                                            ))}
                                          </select>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => {
                                                updateAdAccount(connectedPage.pageId, editingAdAccountValue, connectedPage.provider);
                                              }}
                                              disabled={updatingAdAccount === connectedPage.pageId}
                                              className="flex-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {updatingAdAccount === connectedPage.pageId ? t('dashboard.pages.saving', 'Saving...') : t('dashboard.pages.save', 'Save')}
                                            </button>
                                            <button
                                              onClick={() => {
                                                setExpandedAdAccountPage(null);
                                                setEditingAdAccountValue('');
                                                setUseManualAdAccount(false);
                                              }}
                                              disabled={updatingAdAccount === connectedPage.pageId}
                                              className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {t('dashboard.pages.cancel', 'Cancel')}
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                            </svg>
                                            <span>
                                              {t('dashboard.pages.adAccount', 'Ad Account:')} <span className="font-medium text-gray-900 dark:text-gray-100">
                                                {loadingAdAccounts ? connectedPage.adAccountId : getAdAccountName(connectedPage.adAccountId)}
                                              </span>
                                            </span>
                                          </div>
                                          <button
                                            onClick={() => {
                                              setExpandedAdAccountPage(connectedPage.pageId);
                                              setEditingAdAccountValue(getAdAccountIdForDropdown(connectedPage.adAccountId));
                                              setUseManualAdAccount(false);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                            title={t('dashboard.pages.editAdAccount', 'Edit Ad Account')}
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Two Column Layout: Facebook (Left) & Instagram (Right) */}
                    {(pages.length > 0 || instagramPages.length > 0) && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Facebook Pages Column */}
                        <div className="space-y-5">
                          <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-blue-100/50 to-indigo-50 dark:from-blue-950/50 dark:via-blue-900/30 dark:to-indigo-950/50 rounded-2xl p-6 border border-blue-200/50 dark:border-blue-800/50 shadow-lg shadow-blue-500/5">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 dark:bg-blue-500/5 rounded-full blur-3xl"></div>
                            <div className="relative flex items-center gap-4">
                              <div className="relative">
                                <div className="absolute inset-0 bg-blue-600 rounded-xl blur-md opacity-50"></div>
                                <div className="relative w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                  </svg>
                                </div>
                              </div>
                              <div className="flex-1">
                                <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-400 dark:to-blue-300 bg-clip-text text-transparent mb-1">
                                  {t('dashboard.pages.facebookPages', 'Facebook Pages')}
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.pages.manageConnectedPages', 'Manage your connected pages')}</p>
                              </div>
                              {(() => {
                                const disconnectedPages = pages.filter((page) => !isPageConnected(page.id, 'facebook'));
                                const hasDisconnectedPages = disconnectedPages.length > 0;
                                
                                return (
                                  <div className="relative">
                                    <button
                                      onClick={() => setShowAddPageDropdown(showAddPageDropdown === 'facebook' ? null : 'facebook')}
                                      className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-200 hover:scale-110 group"
                                      title={hasDisconnectedPages ? t('dashboard.pages.addPageTooltip', 'Add Page ({{count}} available)', { count: disconnectedPages.length }) : t('dashboard.pages.allPagesConnectedTooltip', 'All pages are connected')}
                                    >
                                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    </button>
                                    
                                    {/* Modal */}
                                    {showAddPageDropdown === 'facebook' && (
                                      hasDisconnectedPages ? (
                                        /* Modal with disconnected pages */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          {/* Backdrop */}
                                          <div 
                                            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
                                            onClick={() => setShowAddPageDropdown(null)}
                                          ></div>
                                          
                                          {/* Modal */}
                                          <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in duration-200">
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                    </svg>
                                                  </div>
                                                  <div>
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.pages.addFacebookPage', 'Add Facebook Page')}</h3>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                      {t('dashboard.pages.pagesAvailable', '{{count}} page available', { count: disconnectedPages.length })}
                                                    </p>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => setShowAddPageDropdown(null)}
                                                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                                >
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Content */}
                                            <div className="max-h-96 overflow-y-auto py-2 modal-scrollbar">
                                              {disconnectedPages.map((page) => {
                                                const isProcessing = connecting === page.id || disconnecting === page.id;
                                                return (
                                                  <div
                                                    key={`add-fb-${page.id}`}
                                                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                  >
                                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                                                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                      </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <h4 className="font-semibold text-gray-900 dark:text-white truncate mb-0.5">
                                                        {page.name}
                                                      </h4>
                                                      <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {t('dashboard.pages.facebookPage', 'Facebook Page')}
                                                      </p>
                                                    </div>
                                                    <button
                                                      onClick={() => {
                                                        if (!isProcessing) {
                                                          connectPage(page, 'facebook');
                                                          setShowAddPageDropdown(null);
                                                        }
                                                      }}
                                                      disabled={isProcessing}
                                                      className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 group"
                                                      title={t('dashboard.pages.addPage', 'Add page')}
                                                    >
                                                      {isProcessing ? (
                                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                      ) : (
                                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                        </svg>
                                                      )}
                                                    </button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        /* Modal - All pages connected */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          {/* Backdrop */}
                                          <div 
                                            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
                                            onClick={() => setShowAddPageDropdown(null)}
                                          ></div>
                                          
                                          {/* Modal */}
                                          <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in duration-200">
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                    </svg>
                                                  </div>
                                                  <div>
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.pages.facebookPages', 'Facebook Pages')}</h3>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.pages.allPagesConnected', 'All pages connected')}</p>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => setShowAddPageDropdown(null)}
                                                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                                >
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Content */}
                                            <div className="px-6 py-8 text-center">
                                              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center">
                                                <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                              </div>
                                              <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                                {t('dashboard.pages.allFacebookPagesActivated', 'All Facebook Pages Activated')}
                                              </h4>
                                              <p className="text-gray-600 dark:text-gray-400 mb-6">
                                                {t('dashboard.pages.allFacebookPagesActive', 'All Facebook pages in your account are currently connected and active.')}
                                              </p>
                                              <button
                                                onClick={() => setShowAddPageDropdown(null)}
                                                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-200 font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40"
                                              >
                                                {t('dashboard.pages.gotIt', 'Got it')}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    )}
                                    </div>
                                  );
                                })()}
                            </div>
                          </div>
                          
                          {pages.length > 0 ? (
                            <div className="space-y-4">
                              {/* Show only connected pages */}
                              {pages
                                .filter((page) => isPageConnected(page.id, 'facebook'))
                                .map((page) => {
                                  const isConnected = true;
                                  const isProcessing = connecting === page.id || disconnecting === page.id;
                                  const connectedPage = connectedPages.find(cp => cp.pageId === page.id && cp.provider === 'facebook');
                                  
                                  return (
                                    <div
                                      key={`fb-${page.id}`}
                                      className="group relative bg-white dark:bg-gray-900 rounded-xl border border-blue-200/60 dark:border-blue-800/50 p-5 hover:shadow-xl hover:shadow-blue-500/10 dark:hover:shadow-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300 hover:-translate-y-1"
                                    >
                                      {/* Background gradient on hover */}
                                      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 via-blue-50/0 to-blue-100/0 dark:from-blue-950/0 dark:via-blue-900/0 dark:to-blue-800/0 group-hover:from-blue-50/50 group-hover:via-blue-50/30 group-hover:to-blue-100/20 dark:group-hover:from-blue-950/30 dark:group-hover:via-blue-900/20 dark:group-hover:to-blue-800/10 rounded-xl transition-all duration-300"></div>
                                      
                                      <div className="relative">
                                        <div className="flex items-center justify-between mb-4">
                                          <div className="flex items-center gap-3 flex-1 min-w-0 pr-10">
                                            <div className="relative">
                                              <div className="absolute inset-0 bg-blue-500 rounded-xl blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
                                              <div className="relative w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-all">
                                                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                </svg>
                                              </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <h3 className="font-bold text-gray-900 dark:text-white text-base truncate mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {page.name}
                                              </h3>
                                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                {t('dashboard.pages.facebookPage', 'Facebook Page')}
                                              </p>
                                            </div>
                                          </div>
                                          {isConnected && (
                                            <button
                                              onClick={() => setPageToDisconnect({ pageId: page.id, provider: 'facebook', pageName: page.name })}
                                              disabled={isProcessing}
                                              className="absolute top-0 right-0 p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                                              title={t('dashboard.pages.titleDisconnectPage', 'Disconnect page')}
                                            >
                                              <svg className="w-4 h-4 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                            </button>
                                          )}
                                        </div>

                                        <div className="flex items-center justify-between gap-3 mb-3">
                                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/30 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/50 shadow-sm">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            {t('dashboard.pages.connected', 'Connected')}
                                          </span>
                                          
                                          {isConnected && (
                                            <Link
                                              href={`/dashboard/comments?pageId=${page.id}`}
                                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-200 font-semibold text-xs whitespace-nowrap shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transform"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                              </svg>
                                              {t('dashboard.pages.viewComments', 'View Comments')}
                                            </Link>
                                          )}
                                        </div>
                                        
                                        {/* Ad Account Display for connected Facebook pages */}
                                        {isConnected && connectedPage && (connectedPage.adAccountId || expandedAdAccountPage === connectedPage.pageId) && (
                                          <div className="mt-4 pt-4 border-t border-blue-100 dark:border-blue-800/50">
                                            {expandedAdAccountPage === connectedPage.pageId ? (
                                              <div className="space-y-2">
                                                <div className="flex items-center justify-between mb-2">
                                                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                                    </svg>
                                                    <span className="font-medium">{t('dashboard.pages.adAccount', 'Ad Account:')}</span>
                                                  </div>
                                                  <button
                                                    onClick={() => setUseManualAdAccount(!useManualAdAccount)}
                                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                  >
                                                    {useManualAdAccount ? t('dashboard.pages.useDropdown', 'Use Dropdown') : t('dashboard.pages.enterManually', 'Enter Manually')}
                                                  </button>
                                                </div>
                                                {useManualAdAccount ? (
                                                  <input
                                                    type="text"
                                                    value={editingAdAccountValue}
                                                    onChange={(e) => setEditingAdAccountValue(e.target.value)}
                                                    placeholder="act_123456789"
                                                    className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    disabled={updatingAdAccount === connectedPage.pageId}
                                                  />
                                                ) : (
                                                  <select
                                                    value={editingAdAccountValue}
                                                    onChange={(e) => setEditingAdAccountValue(e.target.value)}
                                                    className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    disabled={updatingAdAccount === connectedPage.pageId}
                                                  >
                                                    <option value="">{t('dashboard.pages.noAdAccount', 'No Ad Account')}</option>
                                                    {adAccounts.map((account) => (
                                                      <option key={account.id} value={account.accountId}>
                                                        {account.name} ({account.accountId})
                                                      </option>
                                                    ))}
                                                  </select>
                                                )}
                                                <div className="flex gap-2">
                                                  <button
                                                    onClick={() => {
                                                      updateAdAccount(connectedPage.pageId, editingAdAccountValue, connectedPage.provider);
                                                    }}
                                                    disabled={updatingAdAccount === connectedPage.pageId}
                                                    className="flex-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                  >
                                                    {updatingAdAccount === connectedPage.pageId ? t('dashboard.pages.saving', 'Saving...') : t('dashboard.pages.save', 'Save')}
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setExpandedAdAccountPage(null);
                                                      setEditingAdAccountValue('');
                                                    }}
                                                    disabled={updatingAdAccount === connectedPage.pageId}
                                                    className="px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                  >
                                                    {t('dashboard.pages.cancel', 'Cancel')}
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                                  </svg>
                                                  <span className="font-medium">
                                                    {t('dashboard.pages.adAccount', 'Ad Account:')} <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                      {loadingAdAccounts ? connectedPage.adAccountId : getAdAccountName(connectedPage.adAccountId)}
                                                    </span>
                                                  </span>
                                                </div>
                                                <button
                                                  onClick={() => {
                                                    setExpandedAdAccountPage(connectedPage.pageId);
                                                    setEditingAdAccountValue(getAdAccountIdForDropdown(connectedPage.adAccountId));
                                                    setUseManualAdAccount(false);
                                                  }}
                                                  className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                  title={t('dashboard.pages.editAdAccount', 'Edit Ad Account')}
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                  </svg>
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              
                            </div>
                          ) : (
                            <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-900 dark:to-blue-950/20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                              <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.pages.noFacebookPagesAvailable', 'No Facebook pages available')}</p>
                            </div>
                          )}
                        </div>

                        {/* Instagram Pages Column */}
                        <div className="space-y-5">
                          <div className="relative overflow-hidden bg-gradient-to-br from-pink-50 via-purple-50/50 to-orange-50 dark:from-pink-950/50 dark:via-purple-900/30 dark:to-orange-950/50 rounded-2xl p-6 border border-pink-200/50 dark:border-pink-800/50 shadow-lg shadow-pink-500/5">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-400/10 dark:bg-pink-500/5 rounded-full blur-3xl"></div>
                            <div className="relative flex items-center gap-4">
                              <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-xl blur-md opacity-50"></div>
                                <div className="relative w-14 h-14 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/30">
                                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                  </svg>
                                </div>
                              </div>
                              <div className="flex-1">
                                <h2 className="text-xl font-bold bg-gradient-to-r from-pink-600 via-purple-600 to-orange-600 dark:from-pink-400 dark:via-purple-400 dark:to-orange-400 bg-clip-text text-transparent mb-1">
                                  {t('dashboard.pages.instagramAccounts', 'Instagram Accounts')}
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.pages.manageConnectedAccounts', 'Manage your connected accounts')}</p>
                              </div>
                              {(() => {
                                const disconnectedInstagramPages = instagramPages.filter((page) => !isPageConnected(page.id, 'instagram'));
                                const hasDisconnectedPages = disconnectedInstagramPages.length > 0;
                                
                                return (
                                  <div className="relative">
                                    <button
                                      onClick={() => setShowAddPageDropdown(showAddPageDropdown === 'instagram' ? null : 'instagram')}
                                      className="w-10 h-10 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-600 hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/30 hover:shadow-pink-500/50 transition-all duration-200 hover:scale-110 group"
                                      title={hasDisconnectedPages ? t('dashboard.pages.addPageTooltip', 'Add Page ({{count}} available)', { count: disconnectedInstagramPages.length }) : t('dashboard.pages.allAccountsConnectedTooltip', 'All accounts are connected')}
                                    >
                                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    </button>
                                    
                                    {/* Modal */}
                                    {showAddPageDropdown === 'instagram' && (
                                      hasDisconnectedPages ? (
                                        /* Modal with disconnected Instagram pages */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          {/* Backdrop */}
                                          <div 
                                            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
                                            onClick={() => setShowAddPageDropdown(null)}
                                          ></div>
                                          
                                          {/* Modal */}
                                          <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in duration-200">
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-pink-50 via-purple-50 to-orange-50 dark:from-pink-950/50 dark:via-purple-950/50 dark:to-orange-950/50">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-10 h-10 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-lg flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                    </svg>
                                                  </div>
                                                  <div>
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.pages.addInstagramAccount', 'Add Instagram Account')}</h3>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                      {t('dashboard.pages.accountsAvailable', '{{count}} account available', { count: disconnectedInstagramPages.length })}
                                                    </p>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => setShowAddPageDropdown(null)}
                                                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                                >
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Content */}
                                            <div className="max-h-96 overflow-y-auto py-2 modal-scrollbar-instagram">
                                              {disconnectedInstagramPages.map((page) => {
                                                const isProcessing = connecting === page.id || disconnecting === page.id;
                                                return (
                                                  <div
                                                    key={`add-ig-${page.id}`}
                                                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                  >
                                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden shadow-md">
                                                      {page.profile_picture_url ? (
                                                        <img 
                                                          src={page.profile_picture_url} 
                                                          alt={page.username}
                                                          className="w-full h-full object-cover"
                                                        />
                                                      ) : (
                                                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                        </svg>
                                                      )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <h4 className="font-semibold text-gray-900 dark:text-white truncate mb-0.5">
                                                        {page.name || page.username}
                                                      </h4>
                                                      <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {t('dashboard.pages.instagramAccount', 'Instagram Account')}
                                                      </p>
                                                    </div>
                                                    <button
                                                      onClick={() => {
                                                        if (!isProcessing) {
                                                          connectPage(page, 'instagram');
                                                          setShowAddPageDropdown(null);
                                                        }
                                                      }}
                                                      disabled={isProcessing}
                                                      className="w-9 h-9 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-600 hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 rounded-lg flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 group"
                                                      title={t('dashboard.pages.addAccount', 'Add account')}
                                                    >
                                                      {isProcessing ? (
                                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                      ) : (
                                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                        </svg>
                                                      )}
                                                    </button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        /* Modal - All accounts connected */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          {/* Backdrop */}
                                          <div 
                                            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
                                            onClick={() => setShowAddPageDropdown(null)}
                                          ></div>
                                          
                                          {/* Modal */}
                                          <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in duration-200">
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-pink-50 via-purple-50 to-orange-50 dark:from-pink-950/50 dark:via-purple-950/50 dark:to-orange-950/50">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-10 h-10 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-lg flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                    </svg>
                                                  </div>
                                                  <div>
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('dashboard.pages.instagramAccounts', 'Instagram Accounts')}</h3>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.pages.allAccountsConnected', 'All accounts connected')}</p>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => setShowAddPageDropdown(null)}
                                                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                                >
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Content */}
                                            <div className="px-6 py-8 text-center">
                                              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center">
                                                <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                              </div>
                                              <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                                {t('dashboard.pages.allInstagramAccountsActivated', 'All Instagram Accounts Activated')}
                                              </h4>
                                              <p className="text-gray-600 dark:text-gray-400 mb-6">
                                                {t('dashboard.pages.allInstagramAccountsActive', 'All Instagram accounts in your account are currently connected and active.')}
                                              </p>
                                              <button
                                                onClick={() => setShowAddPageDropdown(null)}
                                                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 text-white rounded-lg transition-all duration-200 font-semibold shadow-lg shadow-pink-500/25 hover:shadow-xl hover:shadow-pink-500/40"
                                              >
                                                {t('dashboard.pages.gotIt', 'Got it')}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    )}
                                    </div>
                                  );
                                })()}
                            </div>
                          </div>
                          
                          {instagramPages.length > 0 ? (
                            <div className="space-y-4">
                              {/* Show only connected Instagram pages */}
                              {instagramPages
                                .filter((page) => isPageConnected(page.id, 'instagram'))
                                .map((page) => {
                                  const isConnected = true;
                                  const isProcessing = connecting === page.id || disconnecting === page.id;
                                  const connectedPage = connectedPages.find(cp => cp.pageId === page.id && cp.provider === 'instagram');
                                  
                                  return (
                                    <div
                                      key={`ig-${page.id}`}
                                      className="group relative bg-white dark:bg-gray-900 rounded-xl border border-pink-200/60 dark:border-pink-800/50 p-5 hover:shadow-xl hover:shadow-pink-500/10 dark:hover:shadow-pink-900/20 hover:border-pink-300 dark:hover:border-pink-700 transition-all duration-300 hover:-translate-y-1"
                                    >
                                      {/* Background gradient on hover */}
                                      <div className="absolute inset-0 bg-gradient-to-br from-pink-50/0 via-purple-50/0 to-orange-50/0 dark:from-pink-950/0 dark:via-purple-900/0 dark:to-orange-900/0 group-hover:from-pink-50/50 group-hover:via-purple-50/30 group-hover:to-orange-50/20 dark:group-hover:from-pink-950/30 dark:group-hover:via-purple-900/20 dark:group-hover:to-orange-900/10 rounded-xl transition-all duration-300"></div>
                                      
                                      <div className="relative">
                                        <div className="flex items-center justify-between mb-4">
                                          <div className="flex items-center gap-3 flex-1 min-w-0 pr-10">
                                            <div className="relative">
                                              <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-xl blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
                                              <div className="relative w-12 h-12 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/30 group-hover:shadow-pink-500/50 transition-all overflow-hidden">
                                                {page.profile_picture_url && isConnected ? (
                                                  <img 
                                                    src={page.profile_picture_url} 
                                                    alt={page.username}
                                                    className="w-full h-full object-cover"
                                                  />
                                                ) : (
                                                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                  </svg>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <h3 className="font-bold text-gray-900 dark:text-white text-base truncate mb-0.5 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                                                {page.name || page.username}
                                              </h3>
                                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                {t('dashboard.pages.instagramAccount', 'Instagram Account')}
                                              </p>
                                            </div>
                                          </div>
                                          {isConnected && (
                                            <button
                                              onClick={() => setPageToDisconnect({ pageId: page.id, provider: 'instagram', pageName: page.name || page.username })}
                                              disabled={isProcessing}
                                              className="absolute top-0 right-0 p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                                              title={t('dashboard.pages.titleDisconnectPage', 'Disconnect page')}
                                            >
                                              <svg className="w-4 h-4 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                            </button>
                                          )}
                                        </div>

                                        <div className="flex items-center justify-between gap-3">
                                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-pink-100 via-purple-100 to-orange-100 dark:from-pink-900/40 dark:via-purple-900/30 dark:to-orange-900/30 text-pink-700 dark:text-pink-300 border border-pink-200/50 dark:border-pink-700/50 shadow-sm">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            {t('dashboard.pages.connected', 'Connected')}
                                          </span>
                                          
                                          {isConnected && (
                                            <Link
                                              href={`/dashboard/comments?pageId=${page.id}`}
                                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 text-white rounded-lg transition-all duration-200 font-semibold text-xs whitespace-nowrap shadow-lg shadow-pink-500/25 hover:shadow-xl hover:shadow-pink-500/40 hover:scale-105 transform"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                              </svg>
                                              {t('dashboard.pages.viewComments', 'View Comments')}
                                            </Link>
                                          )}
                                        </div>
                                        
                                        {/* Ad Account Display for connected Instagram pages */}
                                        {isConnected && connectedPage && (connectedPage.adAccountId || expandedAdAccountPage === connectedPage.pageId) && (
                                          <div className="mt-4 pt-4 border-t border-pink-100 dark:border-pink-800/50">
                                            {expandedAdAccountPage === connectedPage.pageId ? (
                                              <div className="space-y-2">
                                                <div className="flex items-center justify-between mb-2">
                                                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                                    <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                                    </svg>
                                                    <span className="font-medium">{t('dashboard.pages.adAccount', 'Ad Account:')}</span>
                                                  </div>
                                                  <button
                                                    onClick={() => setUseManualAdAccount(!useManualAdAccount)}
                                                    className="text-xs text-pink-600 dark:text-pink-400 hover:underline"
                                                  >
                                                    {useManualAdAccount ? t('dashboard.pages.useDropdown', 'Use Dropdown') : t('dashboard.pages.enterManually', 'Enter Manually')}
                                                  </button>
                                                </div>
                                                {useManualAdAccount ? (
                                                  <input
                                                    type="text"
                                                    value={editingAdAccountValue}
                                                    onChange={(e) => setEditingAdAccountValue(e.target.value)}
                                                    placeholder="act_123456789"
                                                    className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                                                    disabled={updatingAdAccount === connectedPage.pageId}
                                                  />
                                                ) : (
                                                  <select
                                                    value={editingAdAccountValue}
                                                    onChange={(e) => setEditingAdAccountValue(e.target.value)}
                                                    className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                                                    disabled={updatingAdAccount === connectedPage.pageId}
                                                  >
                                                    <option value="">{t('dashboard.pages.noAdAccount', 'No Ad Account')}</option>
                                                    {adAccounts.map((account) => (
                                                      <option key={account.id} value={account.accountId}>
                                                        {account.name} ({account.accountId})
                                                      </option>
                                                    ))}
                                                  </select>
                                                )}
                                                <div className="flex gap-2">
                                                  <button
                                                    onClick={() => {
                                                      updateAdAccount(connectedPage.pageId, editingAdAccountValue, connectedPage.provider);
                                                    }}
                                                    disabled={updatingAdAccount === connectedPage.pageId}
                                                    className="flex-1 px-3 py-1.5 text-xs bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                  >
                                                    {updatingAdAccount === connectedPage.pageId ? t('dashboard.pages.saving', 'Saving...') : t('dashboard.pages.save', 'Save')}
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setExpandedAdAccountPage(null);
                                                      setEditingAdAccountValue('');
                                                    }}
                                                    disabled={updatingAdAccount === connectedPage.pageId}
                                                    className="px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                  >
                                                    {t('dashboard.pages.cancel', 'Cancel')}
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                                  <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                                  </svg>
                                                  <span className="font-medium">
                                                    {t('dashboard.pages.adAccount', 'Ad Account:')} <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                      {loadingAdAccounts ? connectedPage.adAccountId : getAdAccountName(connectedPage.adAccountId)}
                                                    </span>
                                                  </span>
                                                </div>
                                                <button
                                                  onClick={() => {
                                                    setExpandedAdAccountPage(connectedPage.pageId);
                                                    setEditingAdAccountValue(getAdAccountIdForDropdown(connectedPage.adAccountId));
                                                    setUseManualAdAccount(false);
                                                  }}
                                                  className="p-1.5 text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition-colors"
                                                  title={t('dashboard.pages.editAdAccount', 'Edit Ad Account')}
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                  </svg>
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              
                            </div>
                          ) : (
                            <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-pink-50/30 dark:from-gray-900 dark:to-pink-950/20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                              <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.pages.noInstagramAccountsAvailable', 'No Instagram accounts available')}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {pages.length === 0 && instagramPages.length === 0 && connectedPages.length === 0 && (
                  <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-8">
                    <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      No Facebook Pages Found
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Your Facebook account is connected, but you don't have any pages yet.
                    </p>
                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4 text-left max-w-md mx-auto">
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">To use this app, you need to:</p>
                      <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-2 list-decimal list-inside">
                        <li>Create a Facebook Page, OR</li>
                        <li>Get admin access to an existing Facebook Page</li>
                      </ol>
                    </div>
                    <a
                      href="https://www.facebook.com/pages/create"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg mb-4"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      Create a Facebook Page
                    </a>
                    <div>
                      <button
                        onClick={() => fetchData(true)}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"
                      >
                        {t('dashboard.pages.refreshPages', 'Refresh Pages')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Confirmation Dialog for Disconnecting Pages */}
      {pageToDisconnect && (
        <>
          <div 
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" 
            onClick={() => setPageToDisconnect(null)}
          ></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('dashboard.pages.disconnectPageTitle', 'Disconnect Page?')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('dashboard.pages.disconnectPageConfirm', 'Are you sure you want to disconnect {{pageName}}?', { pageName: pageToDisconnect.pageName })}
                </p>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {t('dashboard.pages.disconnectPageDescription', 'This will stop monitoring comments from this page. You can reconnect it anytime.')}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setPageToDisconnect(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                {t('dashboard.pages.cancel', 'Cancel')}
              </button>
              <button
                onClick={async () => {
                  if (pageToDisconnect) {
                    await disconnectPage(pageToDisconnect.pageId, pageToDisconnect.provider);
                    setPageToDisconnect(null);
                  }
                }}
                disabled={disconnecting === pageToDisconnect?.pageId}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {disconnecting === pageToDisconnect?.pageId ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {t('dashboard.pages.disconnecting', 'Disconnecting...')}
                  </>
                ) : (
                  t('dashboard.pages.disconnect', 'Disconnect')
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

