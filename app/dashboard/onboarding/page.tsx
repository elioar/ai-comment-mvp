'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useTranslation } from 'react-i18next';

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
}

interface ConnectedPage {
  id: string;
  pageId: string;
  pageName: string;
  provider: string;
  createdAt: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFbPages, setSelectedFbPages] = useState<string[]>([]);
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [connectedPages, setConnectedPages] = useState<ConnectedPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mount component to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if user is authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Check if Facebook is connected and fetch pages
  useEffect(() => {
    if (session && currentStep === 2) {
      // Check for OAuth callback hash
      const hasOAuthHash = window.location.hash === '#_=_';
      
      if (hasOAuthHash) {
        // Clean up the hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        
        // Wait for NextAuth to process the OAuth callback
        setTimeout(async () => {
          // First refresh token, then fetch pages
          await refreshTokenAndFetchPages();
          // Also fetch pages directly after a short delay
          setTimeout(() => {
            checkFacebookConnection();
          }, 1000);
        }, 3000); // Increased wait time to ensure NextAuth has processed
      } else {
        checkFacebookConnection();
      }
    }
  }, [session, currentStep]);

  const refreshTokenAndFetchPages = async () => {
    try {
      console.log('Refreshing token and fetching pages...');
      // Try to refresh the token first
      const refreshResponse = await fetch('/api/facebook/refresh-token', {
        method: 'POST',
      });
      
      if (refreshResponse.ok) {
        console.log('Token refreshed successfully');
      } else {
        const refreshData = await refreshResponse.json();
        console.log('Token refresh response:', refreshData);
      }
      
      // Wait a bit for token to be saved
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then fetch pages
      await checkFacebookConnection();
    } catch (error) {
      console.error('Error refreshing token:', error);
      // Still try to fetch pages even if refresh fails
      await checkFacebookConnection();
    }
  };

  const checkFacebookConnection = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching Facebook pages from API...');
      const response = await fetch('/api/facebook/pages');
      const data = await response.json();
      
      console.log('API Response:', {
        ok: response.ok,
        pages: data.pages?.length || 0,
        connectedPages: data.connectedPages?.length || 0,
        error: data.error,
      });
      
      // Always set connected pages (they're stored in DB)
      setConnectedPages(data.connectedPages || []);
      
      // ALWAYS set pages if they exist, even if response is not ok
      if (data.pages && Array.isArray(data.pages)) {
        setFbPages(data.pages);
        console.log('Set Facebook pages:', data.pages.length);
      }
      
      if (response.ok) {
        // Success - pages fetched
        if (data.pages && data.pages.length > 0) {
          setFacebookConnected(true);
          // Pre-select already connected pages
          const connectedPageIds = data.connectedPages.map((cp: ConnectedPage) => cp.pageId);
          setSelectedFbPages(connectedPageIds);
          setError(null);
        } else if (data.error) {
          // Error but check what kind
          if (data.error.includes('No Facebook account connected')) {
            setFacebookConnected(false);
            setError(null);
          } else {
            setFacebookConnected(true);
            setError(data.error);
          }
        } else {
          // No pages but no error - account connected but user has no pages
          setFacebookConnected(true);
          setError(null);
        }
      } else {
        // Response not ok
        if (data.pages && data.pages.length > 0) {
          // We have pages even though response wasn't ok
          setFacebookConnected(true);
          setError(null);
        } else if (data.connectedPages && data.connectedPages.length > 0) {
          // We have connected pages
          setFacebookConnected(true);
          setError(null);
        } else {
          setFacebookConnected(data.error?.includes('No Facebook account connected') ? false : true);
          setError(data.error || 'Failed to fetch pages');
        }
      }
    } catch (error) {
      console.error('Error checking Facebook connection:', error);
      // If we have connected pages, don't show error
      if (connectedPages.length > 0) {
        setFacebookConnected(true);
        setError(null);
      } else {
        setError('Error loading Facebook pages');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    try {
      // Store current user ID before OAuth so we can link Facebook to this account
      if (session?.user?.id) {
        try {
          await fetch('/api/auth/set-linking-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.user.id }),
          });
        } catch (error) {
          console.error('Error storing linking user:', error);
          // Still continue with OAuth even if storing fails
        }
      }
      
      await signIn('facebook', { 
        callbackUrl: '/dashboard/onboarding?step=2',
        redirect: true 
      });
    } catch (error) {
      console.error('Facebook login error:', error);
      setError('Failed to connect Facebook account');
    }
  };

  const connectPage = async (page: FacebookPage) => {
    setConnecting(page.id);
    setError(null);
    try {
      const response = await fetch('/api/facebook/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          provider: 'facebook',
        }),
      });

      if (response.ok) {
        // Refresh pages list
        await checkFacebookConnection();
        // Add to selected if not already
        if (!selectedFbPages.includes(page.id)) {
          setSelectedFbPages([...selectedFbPages, page.id]);
        }
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

  const toggleFbPage = (pageId: string) => {
    const page = fbPages.find(p => p.id === pageId);
    if (page) {
      if (selectedFbPages.includes(pageId)) {
        // Already connected, just toggle selection
        setSelectedFbPages(prev => prev.filter(id => id !== pageId));
      } else {
        // Not connected yet, connect it
        connectPage(page);
      }
    }
  };

  const totalSteps = 3;

  const steps = [
    { number: 1, title: t('onboarding.steps.welcome') || 'Welcome', description: t('onboarding.steps.welcomeDesc') || 'Get started with AI comment management' },
    { number: 2, title: t('onboarding.steps.connectFacebook') || 'Connect Facebook', description: t('onboarding.steps.connectFacebookDesc') || 'Link your Facebook pages' },
    { number: 3, title: t('onboarding.steps.allSet') || 'All Set!', description: t('onboarding.steps.allSetDesc') || 'Start managing comments' },
  ];

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      // Onboarding complete, navigate to dashboard
      router.push('/dashboard');
    }
  };

  const handleSkip = () => {
    router.push('/dashboard');
  };

  // Prevent hydration mismatch - wait for mount
  if (!mounted || status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-gray-950 dark:via-black dark:to-gray-950 flex items-center justify-center">
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-gray-950 dark:via-black dark:to-gray-950 flex items-center justify-center p-4">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400/10 dark:bg-blue-500/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-violet-400/10 dark:bg-violet-500/5 rounded-full blur-3xl"></div>

      <div className="relative w-full max-w-4xl">
        {/* Progress Steps Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            {/* Progress Line */}
            <div className="absolute top-8 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-800 -z-10">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-violet-600 transition-all duration-500 ease-out"
                style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
              ></div>
            </div>

            {steps.map((step) => (
              <div key={step.number} className="flex flex-col items-center">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                    currentStep >= step.number
                      ? 'bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg scale-100'
                      : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 scale-90'
                  }`}
                >
                  {currentStep > step.number ? (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <div className="mt-3 text-center">
                  <p className={`text-sm font-semibold ${
                    currentStep >= step.number
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-gray-600'
                  }`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white dark:bg-gray-950 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-900 overflow-hidden">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="p-8 sm:p-12 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                {t('onboarding.welcome.title') || 'Welcome to AI Comments! 🎉'}
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
                {t('onboarding.welcome.description') || 'Let\'s set up your account to start managing comments automatically with AI.'}
              </p>

              {/* Benefits Grid */}
              <div className="grid sm:grid-cols-3 gap-4 mb-8 max-w-3xl mx-auto">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-xl border border-blue-200 dark:border-blue-900">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.fast') || 'Lightning Fast'}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.fastDesc') || 'AI-powered responses in seconds'}</p>
                </div>

                <div className="p-4 bg-violet-50 dark:bg-violet-950 rounded-xl border border-violet-200 dark:border-violet-900">
                  <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.smart') || 'Smart & Safe'}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.smartDesc') || 'Brand-safe AI responses'}</p>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-xl border border-green-200 dark:border-green-900">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.save') || 'Save Time'}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.saveDesc') || 'Automate comment management'}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleNext}
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  {t('onboarding.welcome.getStarted') || 'Get Started'}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
                <button
                  onClick={handleSkip}
                  className="px-8 py-3.5 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                >
                  {t('onboarding.welcome.skipForNow') || 'Skip for Now'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connect Facebook */}
          {currentStep === 2 && (
            <div className="p-8 sm:p-12">
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  {t('onboarding.facebook.title') || 'Connect Your Facebook Pages'}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                  {t('onboarding.facebook.description') || 'Connect your Facebook pages to start managing comments automatically.'}
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                </div>
              )}

              {/* Facebook Connect Button */}
              {!facebookConnected && (
                <div className="mb-8 text-center">
                  <button
                    onClick={handleFacebookLogin}
                    className="inline-flex items-center gap-3 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    {t('onboarding.facebook.connectButton') || 'Connect Facebook Account'}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    {t('onboarding.facebook.security') || 'We use secure OAuth to connect your account. Your password is never shared.'}
                  </p>
                </div>
              )}

              {/* Loading State */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                </div>
              )}

              {/* Facebook Pages Selection */}
              {facebookConnected && !loading && (
                <div className="space-y-3 mb-8">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    {t('onboarding.facebook.selectPages') || 'Select Pages to Connect'} ({selectedFbPages.length} {t('onboarding.facebook.selected') || 'selected'})
                  </p>
                  
                  {fbPages.length === 0 && !error ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-xl">
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {t('onboarding.facebook.noPages') || 'No Facebook pages found. Make sure you have admin access to at least one page.'}
                      </p>
                      <button
                        onClick={checkFacebookConnection}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                      >
                        Refresh Pages
                      </button>
                    </div>
                  ) : fbPages.length === 0 && error ? (
                    <div className="text-center py-8 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                      <p className="text-red-800 dark:text-red-200 mb-4">{error}</p>
                      <button
                        onClick={handleFacebookLogin}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                      >
                        Reconnect Facebook
                      </button>
                    </div>
                  ) : (
                    fbPages.map((page) => {
                      const isConnected = connectedPages.some(cp => cp.pageId === page.id);
                      const isSelected = selectedFbPages.includes(page.id);
                      
                      return (
                        <div
                          key={page.id}
                          onClick={() => !isConnected && toggleFbPage(page.id)}
                          className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                            isConnected || isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-md cursor-default'
                              : 'border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md cursor-pointer'
                          } ${isConnected ? 'opacity-75' : ''}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                              </svg>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">{page.name}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {isConnected ? 'Already connected' : 'Click to connect'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {isConnected && (
                              <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-medium rounded-full">
                                Connected
                              </span>
                            )}
                            {connecting === page.id && (
                              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            )}
                            <div
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                isConnected || isSelected
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-gray-300 dark:border-gray-700'
                              }`}
                            >
                              {(isConnected || isSelected) && (
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('onboarding.navigation.back') || 'Back'}
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={handleSkip}
                    className="px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                  >
                    {t('onboarding.navigation.skip') || 'Skip'}
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!facebookConnected || selectedFbPages.length === 0}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('onboarding.navigation.continue') || 'Continue'}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Success/Complete */}
          {currentStep === 3 && (
            <div className="p-8 sm:p-12 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl animate-bounce">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                {t('onboarding.success.title') || 'You\'re All Set! 🎉'}
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
                {t('onboarding.success.description') || 'Your Facebook pages are connected. Start managing comments with AI!'}
              </p>

              {/* Summary */}
              <div className="bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950 dark:to-violet-950 rounded-2xl p-6 mb-8 border border-blue-200 dark:border-blue-900">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('onboarding.success.connectedAccounts') || 'Connected Accounts'}</h3>
                <div className="grid sm:grid-cols-1 gap-4 max-w-md mx-auto">
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-white">{t('onboarding.success.facebook') || 'Facebook'}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{selectedFbPages.length} {t('onboarding.success.pages') || 'pages connected'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Steps */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 mb-8 text-left max-w-2xl mx-auto">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-center">{t('onboarding.success.whatNext') || 'What\'s Next?'}</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">1</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{t('onboarding.success.step1') || 'View Your Comments'}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('onboarding.success.step1Desc') || 'Go to the Comments page to see all comments from your connected pages'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-violet-100 dark:bg-violet-950 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-violet-600 dark:text-violet-400">2</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{t('onboarding.success.step2') || 'Set Up AI Replies'}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('onboarding.success.step2Desc') || 'Configure your AI response settings and templates'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-green-600 dark:text-green-400">3</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{t('onboarding.success.step3') || 'Start Managing'}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('onboarding.success.step3Desc') || 'Let AI help you respond to comments automatically'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {t('onboarding.success.goToDashboard') || 'Go to Dashboard'}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Bottom Helper Text */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('onboarding.needHelp') || 'Need help?'} <Link href="/help" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">{t('onboarding.contactSupport') || 'Contact Support'}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
