'use client';

import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (session) {
      fetchData();
      // After OAuth redirect, try to link Facebook account to current user
      linkFacebookAccount();
    }
  }, [session]);

  const linkFacebookAccount = async () => {
    try {
      // Check if we just came back from Facebook OAuth
      const urlParams = new URLSearchParams(window.location.search);
      const storedUserId = sessionStorage.getItem('linkingUserId');
      
      if (urlParams.get('linked') !== 'true' && storedUserId) {
        // Try to link any unlinked Facebook account to the stored user ID
        const response = await fetch('/api/facebook/link-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetUserId: storedUserId, // Pass the original user ID
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && !data.alreadyLinked) {
            // Clear the stored user ID
            sessionStorage.removeItem('linkingUserId');
            // Refresh the page data after linking
            await fetchData();
            // Update URL to prevent re-linking
            window.history.replaceState({}, '', '/dashboard/pages?linked=true');
            // Refresh data to show updated pages
            await fetchData();
          }
        } else {
          // Clear stored ID on error
          sessionStorage.removeItem('linkingUserId');
        }
      } else if (storedUserId) {
        // Already linked, clear the stored ID
        sessionStorage.removeItem('linkingUserId');
      }
    } catch (error) {
      console.error('Error linking Facebook account:', error);
      sessionStorage.removeItem('linkingUserId');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/facebook/pages');
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        setError('Failed to fetch pages');
        return;
      }
      
      // Always set connected pages first, even if there's an error (they're stored in DB)
      if (data.connectedPages && Array.isArray(data.connectedPages)) {
        setConnectedPages(data.connectedPages);
      }
      
      if (response.ok) {
        setPages(data.pages || []);
        setInstagramPages(data.instagramPages || []);
        // Only show error if there are no connected pages to display
        if (data.error && (!data.connectedPages || data.connectedPages.length === 0)) {
          setError(data.error);
        }
      } else {
        // Even if response is not ok, we still have connected pages
        setPages(data.pages || []);
        setInstagramPages(data.instagramPages || []);
        // Only show error if we have no connected pages to display
        if (!data.connectedPages || data.connectedPages.length === 0) {
          setError(data.error || 'Failed to fetch pages');
        }
      }
    } catch (error) {
      console.error('Error fetching pages:', error);
      // Don't set error if we have connected pages - they might still work
      setError('Error loading pages');
    } finally {
      setLoading(false);
    }
  };

  const connectPage = async (page: FacebookPage | InstagramPage, provider: 'facebook' | 'instagram' = 'facebook') => {
    setConnecting(page.id);
    setError(null);
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
      const response = await fetch('/api/facebook/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pageId: page.id,
          pageName: pageName,
          pageAccessToken: page.access_token,
          provider: provider,
        }),
      });

      if (response.ok) {
        await fetchData();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to connect page');
      }
    } catch (error) {
      console.error('Error connecting page:', error);
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
        await fetchData();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to disconnect page');
      }
    } catch (error) {
      console.error('Error disconnecting page:', error);
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
              <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-all ${
                    currentLanguage === 'en' || currentLanguage.startsWith('en')
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLanguage('el')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-all ${
                    currentLanguage === 'el' || currentLanguage.startsWith('el')
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  ΕΛ
                </button>
              </div>

              <button
                onClick={toggleTheme}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-all"
              >
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </button>

              <ProfileDropdown />
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-80px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
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
                          Connect Your Facebook & Instagram Pages
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                          {t('dashboard.pages.description')}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                          Make sure you have admin access to the Facebook pages and Instagram Business accounts you want to connect.
                        </p>
                  </div>
                  <button
                    onClick={async () => {
                      // Store current user ID before OAuth
                      if (session?.user?.id) {
                        try {
                          await fetch('/api/auth/set-linking-user', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: session.user.id }),
                          });
                        } catch (error) {
                          console.error('Error storing linking user:', error);
                        }
                      }
                      await signIn('facebook', { callbackUrl: '/dashboard/pages' });
                    }}
                    className="inline-flex items-center gap-3 px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-base shadow-md hover:shadow-lg"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    Connect Facebook Account
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                    Your Facebook account will be linked to your current account ({session?.user?.email})
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Your Pages
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('dashboard.pages.description')}
                  </p>
                </div>

                {(pages.length > 0 || instagramPages.length > 0 || connectedPages.length > 0) && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {/* Facebook Pages */}
                    {pages.map((page) => {
                      const isConnected = isPageConnected(page.id, 'facebook');
                      const isProcessing = connecting === page.id || disconnecting === page.id;
                      
                      return (
                        <div
                          key={`fb-${page.id}`}
                          className={`bg-white dark:bg-gray-950 rounded-xl border ${
                            isConnected 
                              ? 'border-blue-200 dark:border-blue-900' 
                              : 'border-gray-200 dark:border-gray-800'
                          } p-6 hover:shadow-lg transition-all`}
                        >
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                                isConnected 
                                  ? 'bg-blue-600' 
                                  : 'bg-gray-400 dark:bg-gray-700'
                              }`}>
                                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate">
                                  {page.name}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Facebook Page
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isConnected}
                                  onChange={() => {
                                    if (isConnected) {
                                      disconnectPage(page.id, 'facebook');
                                    } else {
                                      connectPage(page, 'facebook');
                                    }
                                  }}
                                  disabled={isProcessing}
                                  className="sr-only peer"
                                />
                                <div className={`
                                  relative w-11 h-6 rounded-full transition-all duration-300 ease-in-out
                                  ${isConnected 
                                    ? 'bg-blue-600 dark:bg-blue-500' 
                                    : 'bg-gray-300 dark:bg-gray-600'
                                  }
                                  ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                  peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800
                                `}>
                                  <div className={`
                                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-lg
                                    transform transition-transform duration-300 ease-in-out
                                    ${isConnected ? 'translate-x-5' : 'translate-x-0'}
                                  `} />
                                </div>
                              </label>
                              <span className={`text-sm font-medium ${
                                isProcessing
                                  ? 'text-gray-500 dark:text-gray-500'
                                  : isConnected
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-gray-600 dark:text-gray-400'
                              }`}>
                                {isProcessing 
                                  ? (isConnected ? 'Disconnecting...' : 'Connecting...')
                                  : (isConnected ? 'Connected' : 'Disconnected')
                                }
                              </span>
                            </div>
                            
                            {isConnected && (
                              <Link
                                href={`/dashboard/comments?pageId=${page.id}&provider=facebook`}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm whitespace-nowrap"
                              >
                                View Comments
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Instagram Pages */}
                    {instagramPages.map((page) => {
                      const isConnected = isPageConnected(page.id, 'instagram');
                      const isProcessing = connecting === page.id || disconnecting === page.id;
                      
                      return (
                        <div
                          key={`ig-${page.id}`}
                          className={`bg-white dark:bg-gray-950 rounded-xl border ${
                            isConnected 
                              ? 'border-pink-200 dark:border-pink-900' 
                              : 'border-gray-200 dark:border-gray-800'
                          } p-6 hover:shadow-lg transition-all`}
                        >
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md overflow-hidden ${
                                isConnected 
                                  ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500' 
                                  : 'bg-gray-400 dark:bg-gray-700'
                              }`}>
                                {page.profile_picture_url && isConnected ? (
                                  <img 
                                    src={page.profile_picture_url} 
                                    alt={page.username}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate">
                                  {page.name || page.username}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Instagram Account
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isConnected}
                                  onChange={() => {
                                    if (isConnected) {
                                      disconnectPage(page.id, 'instagram');
                                    } else {
                                      connectPage(page, 'instagram');
                                    }
                                  }}
                                  disabled={isProcessing}
                                  className="sr-only peer"
                                />
                                <div className={`
                                  relative w-11 h-6 rounded-full transition-all duration-300 ease-in-out
                                  ${isConnected 
                                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-500 dark:to-pink-500' 
                                    : 'bg-gray-300 dark:bg-gray-600'
                                  }
                                  ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                  peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 dark:peer-focus:ring-pink-800
                                `}>
                                  <div className={`
                                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-lg
                                    transform transition-transform duration-300 ease-in-out
                                    ${isConnected ? 'translate-x-5' : 'translate-x-0'}
                                  `} />
                                </div>
                              </label>
                              <span className={`text-sm font-medium ${
                                isProcessing
                                  ? 'text-gray-500 dark:text-gray-500'
                                  : isConnected
                                  ? 'text-pink-600 dark:text-pink-400'
                                  : 'text-gray-600 dark:text-gray-400'
                              }`}>
                                {isProcessing 
                                  ? (isConnected ? 'Disconnecting...' : 'Connecting...')
                                  : (isConnected ? 'Connected' : 'Disconnected')
                                }
                              </span>
                            </div>
                            
                            {isConnected && (
                              <Link
                                href={`/dashboard/comments?pageId=${page.id}&provider=instagram`}
                                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-colors font-medium text-sm whitespace-nowrap"
                              >
                                View Comments
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {pages.length === 0 && instagramPages.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">
                      No pages found. Make sure your Facebook account has pages or Instagram Business accounts connected.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

