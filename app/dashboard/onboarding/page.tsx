'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFbPages, setSelectedFbPages] = useState<string[]>([]);
  const [selectedIgPages, setSelectedIgPages] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  // Mount component to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const totalSteps = 4;

  // Mock data for testing
  const mockFbPages = [
    { id: '1', name: 'My Business Page', followers: '12.5K', image: '📘' },
    { id: '2', name: 'Tech Blog', followers: '8.2K', image: '💻' },
    { id: '3', name: 'Lifestyle & Travel', followers: '25.1K', image: '✈️' },
  ];

  const mockIgPages = [
    { id: '1', name: '@mybusiness', followers: '45.2K', image: '📸' },
    { id: '2', name: '@techblog_official', followers: '32.8K', image: '🎨' },
    { id: '3', name: '@lifestyle.travels', followers: '67.5K', image: '🌍' },
  ];

  const steps = [
    { number: 1, title: t('onboarding.steps.welcome'), description: t('onboarding.steps.welcomeDesc') },
    { number: 2, title: t('onboarding.steps.connectFacebook'), description: t('onboarding.steps.connectFacebookDesc') },
    { number: 3, title: t('onboarding.steps.connectInstagram'), description: t('onboarding.steps.connectInstagramDesc') },
    { number: 4, title: t('onboarding.steps.allSet'), description: t('onboarding.steps.allSetDesc') },
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

  const toggleFbPage = (pageId: string) => {
    setSelectedFbPages(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  const toggleIgPage = (pageId: string) => {
    setSelectedIgPages(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  // Prevent hydration mismatch - wait for mount
  if (!mounted) {
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                {t('onboarding.welcome.title')} 🎉
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
                {t('onboarding.welcome.description')}
              </p>

              {/* Benefits Grid */}
              <div className="grid sm:grid-cols-3 gap-4 mb-8 max-w-3xl mx-auto">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-xl border border-blue-200 dark:border-blue-900">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.fast')}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.fastDesc')}</p>
                </div>

                <div className="p-4 bg-violet-50 dark:bg-violet-950 rounded-xl border border-violet-200 dark:border-violet-900">
                  <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.smart')}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.smartDesc')}</p>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-xl border border-green-200 dark:border-green-900">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.save')}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.saveDesc')}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleNext}
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  {t('onboarding.welcome.getStarted')}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
                <button
                  onClick={handleSkip}
                  className="px-8 py-3.5 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                >
                  {t('onboarding.welcome.skipForNow')}
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
                  {t('onboarding.facebook.title')}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                  {t('onboarding.facebook.description')}
                </p>
              </div>

              {/* Facebook Connect Button */}
              <div className="mb-8 text-center">
                <button className="inline-flex items-center gap-3 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  {t('onboarding.facebook.connectButton')}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  {t('onboarding.facebook.security')}
                </p>
              </div>

              {/* Mock Pages Selection */}
              <div className="space-y-3 mb-8">
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  {t('onboarding.facebook.selectPages')} ({selectedFbPages.length} {t('onboarding.facebook.selected')})
                </p>
                {mockFbPages.map((page) => (
                  <div
                    key={page.id}
                    onClick={() => toggleFbPage(page.id)}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedFbPages.includes(page.id)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-md'
                        : 'border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-2xl shadow-md">
                        {page.image}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{page.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{page.followers} followers</p>
                      </div>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedFbPages.includes(page.id)
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300 dark:border-gray-700'
                      }`}
                    >
                      {selectedFbPages.includes(page.id) && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('onboarding.navigation.back')}
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={handleSkip}
                    className="px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                  >
                    {t('onboarding.navigation.skip')}
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={selectedFbPages.length === 0}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('onboarding.navigation.continue')}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Connect Instagram */}
          {currentStep === 3 && (
            <div className="p-8 sm:p-12">
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  {t('onboarding.instagram.title')}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                  {t('onboarding.instagram.description')}
                </p>
              </div>

              {/* Instagram Connect Button */}
              <div className="mb-8 text-center">
                <button className="inline-flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  {t('onboarding.instagram.connectButton')}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  {t('onboarding.instagram.businessOnly')}
                </p>
              </div>

              {/* Mock Instagram Accounts Selection */}
              <div className="space-y-3 mb-8">
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  {t('onboarding.facebook.selectPages')} ({selectedIgPages.length} {t('onboarding.facebook.selected')})
                </p>
                {mockIgPages.map((page) => (
                  <div
                    key={page.id}
                    onClick={() => toggleIgPage(page.id)}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedIgPages.includes(page.id)
                        ? 'border-pink-500 bg-pink-50 dark:bg-pink-950 shadow-md'
                        : 'border-gray-200 dark:border-gray-800 hover:border-pink-300 dark:hover:border-pink-800 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-600 rounded-xl flex items-center justify-center text-2xl shadow-md">
                        {page.image}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{page.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{page.followers} followers</p>
                      </div>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedIgPages.includes(page.id)
                          ? 'border-pink-500 bg-pink-500'
                          : 'border-gray-300 dark:border-gray-700'
                      }`}
                    >
                      {selectedIgPages.includes(page.id) && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('onboarding.navigation.back')}
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={handleSkip}
                    className="px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                  >
                    {t('onboarding.navigation.skip')}
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={selectedIgPages.length === 0}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('onboarding.navigation.continue')}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Success/Complete */}
          {currentStep === 4 && (
            <div className="p-8 sm:p-12 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl animate-bounce">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                {t('onboarding.success.title')} 🎉
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
                {t('onboarding.success.description')}
              </p>

              {/* Summary */}
              <div className="bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950 dark:to-violet-950 rounded-2xl p-6 mb-8 border border-blue-200 dark:border-blue-900">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('onboarding.success.connectedAccounts')}</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-white">{t('onboarding.success.facebook')}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{selectedFbPages.length} {t('onboarding.success.pages')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-white">{t('onboarding.success.instagram')}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{selectedIgPages.length} {t('onboarding.success.accounts')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Steps */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 mb-8 text-left">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-center">{t('onboarding.success.whatNext')}</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">1</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{t('onboarding.success.step1')}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('onboarding.success.step1Desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-violet-100 dark:bg-violet-950 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-violet-600 dark:text-violet-400">2</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{t('onboarding.success.step2')}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('onboarding.success.step2Desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-green-600 dark:text-green-400">3</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{t('onboarding.success.step3')}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('onboarding.success.step3Desc')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {t('onboarding.success.goToDashboard')}
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
            {t('onboarding.needHelp')} <Link href="/help" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">{t('onboarding.contactSupport')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
