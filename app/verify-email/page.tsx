'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { authFunctions } from '@/lib/authFunctions';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [isVerifying, setIsVerifying] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setAlertMessage({
          type: 'error',
          message: 'Invalid or missing verification token.',
        });
        setIsVerifying(false);
        return;
      }

      try {
        const response = await authFunctions.verifyEmail(token);
        setAlertMessage({
          type: 'success',
          message: response.message || 'Email verified successfully!',
        });
        setIsSuccess(true);
      } catch (error) {
        setAlertMessage({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to verify email. Please try again.',
        });
      } finally {
        setIsVerifying(false);
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <AuthLayout>
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-800/50 shadow-2xl p-8">
        <div className="text-center">
          {isVerifying ? (
            <div className="space-y-6">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Verifying your email</h1>
                <p className="text-gray-600 dark:text-gray-300">Please wait while we verify your email address...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                isSuccess ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
              }`}>
                {isSuccess ? (
                  <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>

              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                  {isSuccess ? 'Email verified!' : 'Verification failed'}
                </h1>
                
                {alertMessage && (
                  <div className="mb-6">
                    <Alert
                      type={alertMessage.type}
                      message={alertMessage.message}
                    />
                  </div>
                )}

                {isSuccess ? (
                  <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                      Your email has been successfully verified. You can now log in to your account.
                    </p>
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-lg hover:shadow-xl"
                    >
                      Continue to login
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                      The verification link may have expired or is invalid.
                    </p>
                    <div className="space-y-3">
                      <Link
                        href="/register"
                        className="block text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                      >
                        Create a new account
                      </Link>
                      <div className="text-gray-500 dark:text-gray-400">or</div>
                      <Link
                        href="/login"
                        className="block text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                      >
                        Go to login
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
