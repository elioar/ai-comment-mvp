'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Mount component to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = t('auth.login.emailRequired');
    } else if (!validateEmail(email)) {
      newErrors.email = t('auth.login.invalidEmail');
    }

    if (!password) {
      newErrors.password = t('auth.login.passwordRequired');
    } else if (password.length < 8) {
      newErrors.password = t('auth.login.passwordLength');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlertMessage(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setAlertMessage({
          type: 'error',
          message: t('auth.login.loginError'),
        });
      } else {
        setAlertMessage({ type: 'success', message: t('auth.login.loginSuccess') });
        setTimeout(() => {
          router.push('/dashboard');
        }, 1000);
      }
    } catch (error) {
      setAlertMessage({
        type: 'error',
        message: t('auth.login.loginFailed'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'facebook') => {
    try {
      await signIn(provider, { callbackUrl: '/dashboard' });
    } catch (error) {
      setAlertMessage({
        type: 'error',
        message: `Failed to sign in with ${provider}`,
      });
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <AuthLayout>
      <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden max-w-md w-full">
        {/* Header Section - Minimal */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('auth.login.title')}
          </h1>
        </div>

        {/* Form Section - Compact */}
        <div className="p-5">
          {alertMessage && (
            <div className="mb-6">
              <Alert
                type={alertMessage.type}
                message={alertMessage.message}
                onClose={() => setAlertMessage(null)}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField>
              <Input
                label={t('auth.login.email')}
                type="email"
                placeholder={t('auth.login.emailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                error={errors.email}
                disabled={isLoading}
              />
            </FormField>

            <FormField>
              <PasswordInput
                label={t('auth.login.password')}
                placeholder={t('auth.login.passwordPlaceholder')}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: undefined });
                }}
                error={errors.password}
                disabled={isLoading}
              />
            </FormField>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-5 h-5 rounded border-2 border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 checked:bg-blue-600 checked:border-blue-600 dark:checked:bg-blue-500 dark:checked:border-blue-500 appearance-none cursor-pointer transition-all" 
                  />
                  {rememberMe && (
                    <svg 
                      className="absolute top-0 left-0 w-5 h-5 pointer-events-none"
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="white" 
                      strokeWidth="3"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-gray-600 dark:text-gray-400">
                  {t('auth.login.rememberMe')}
                </span>
              </label>
              <Link 
                href="/forgot-password" 
                className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
              >
                {t('auth.login.forgotPassword')}
              </Link>
            </div>

            <Button 
              type="submit" 
              isLoading={isLoading} 
              className="w-full h-10 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              {isLoading ? t('auth.login.signingIn') : t('auth.login.signInButton')}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 text-xs bg-white dark:bg-gray-950 text-gray-500 dark:text-gray-400">
                {t('auth.login.orContinueWith')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleOAuthSignIn('google')}
              className="flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-xs text-gray-700 dark:text-gray-200"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="hidden sm:inline">Google</span>
            </button>

            <button
              onClick={() => handleOAuthSignIn('facebook')}
              className="flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-xs text-gray-700 dark:text-gray-200"
            >
              <svg className="w-4 h-4 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className="hidden sm:inline">Facebook</span>
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <p className="text-center text-xs text-gray-600 dark:text-gray-400">
              {t('auth.login.noAccount')}{' '}
              <Link 
                href="/register" 
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t('auth.login.signUp')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
