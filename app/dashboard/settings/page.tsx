'use client';

import React, { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [metaAccount, setMetaAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    if (session?.user?.id) {
      fetchMetaAccount();
    }
  }, [session]);

  const fetchMetaAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/facebook/pages');
      const data = await response.json();
      
      // Check if user has a Facebook account connected
      if (data.pages && data.pages.length > 0) {
        setMetaAccount({
          provider: 'facebook',
          connected: true,
          pagesCount: data.pages.length,
          instagramCount: data.instagramPages?.length || 0,
        });
      } else if (data.connectedPages && data.connectedPages.length > 0) {
        // User has connected pages but might not have active account
        setMetaAccount({
          provider: 'facebook',
          connected: false,
          hasConnectedPages: true,
          pagesCount: data.connectedPages.filter((p: any) => p.provider === 'facebook').length,
          instagramCount: data.connectedPages.filter((p: any) => p.provider === 'instagram').length,
        });
      } else {
        setMetaAccount(null);
      }
    } catch (error) {      setError('Failed to load account information');
    } finally {
      setLoading(false);
    }
  };

  const disconnectMetaAccount = async () => {
    if (!confirm('Are you sure you want to disconnect your Meta account? This will also disconnect all connected pages.')) {
      return;
    }

    setDisconnecting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/account/disconnect?provider=facebook', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Meta account disconnected successfully');
        setMetaAccount(null);
        // Refresh after a moment
        setTimeout(() => {
          router.refresh();
        }, 1000);
      } else {
        setError(data.error || 'Failed to disconnect account');
      }
    } catch (error) {      setError('Error disconnecting account');
    } finally {
      setDisconnecting(false);
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

  if (status === 'loading' || !mounted || !session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
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
          {/* Logo */}
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

          {/* Navigation */}
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

          {/* Footer User Info */}
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

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
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
                {t('dashboard.menu.settings')}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Settings Content */}
        <main className="min-h-[calc(100vh-80px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-4xl mx-auto">
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-green-800 dark:text-green-200 text-sm">{success}</p>
              </div>
            )}

            {/* Connected Accounts Section */}
            <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                Connected Accounts
              </h2>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                </div>
              ) : metaAccount ? (
                <div className="space-y-4">
                  {/* Meta Account Card */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">Meta (Facebook)</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {metaAccount.connected 
                            ? `${metaAccount.pagesCount} Facebook page${metaAccount.pagesCount !== 1 ? 's' : ''}, ${metaAccount.instagramCount} Instagram account${metaAccount.instagramCount !== 1 ? 's' : ''}`
                            : metaAccount.hasConnectedPages
                            ? `${metaAccount.pagesCount} connected page${metaAccount.pagesCount !== 1 ? 's' : ''} (account disconnected)`
                            : 'Connected'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {metaAccount.connected ? (
                        <button
                          onClick={disconnectMetaAccount}
                          disabled={disconnecting}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium text-sm"
                        >
                          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                      ) : (
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
                              } catch (error) {                                // Still continue with OAuth even if storing fails
                              }
                            }
                            await signIn('facebook', { callbackUrl: '/dashboard/settings' });
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                          </svg>
                          Connect Facebook Account
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No accounts connected</p>
                  <button
                    onClick={async () => {
                      // Check if Facebook is configured before attempting OAuth
                      try {
                        const configCheck = await fetch('/api/auth/check-facebook-config');
                        
                        if (!configCheck.ok) {                          // Continue anyway - let NextAuth handle the error
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
                      } catch (error) {                        // Continue anyway - let NextAuth handle the error
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
                        } catch (error) {                          // Still continue with OAuth even if storing fails
                        }
                      }
                      
                      try {
                        await signIn('facebook', { callbackUrl: '/dashboard/settings' });
                      } catch (error: any) {                        alert(`Failed to connect Facebook: ${error?.message || 'Unknown error'}. Please check your Facebook App configuration.`);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    Connect Meta Account
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

