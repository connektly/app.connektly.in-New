import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Eye, EyeOff, User, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { getCachedSession, supabase } from '../lib/supabase';
import { appApi } from '../lib/api';
import TurnstileWidget from '../components/TurnstileWidget';
import { clientConfig, hasTurnstileSiteKey } from '../lib/config';
import loginImage from '../../login-image.png';

type OAuthProvider = 'google' | 'facebook';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.03 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.88v2.27h3.34l-.53 3.49h-2.81V24C19.61 23.1 24 18.1 24 12.07z"
      />
      <path
        fill="#FFFFFF"
        d="M16.67 15.56l.53-3.49h-3.34V9.8c0-.95.47-1.88 1.96-1.88h1.51V4.95s-1.37-.24-2.68-.24c-2.74 0-4.53 1.67-4.53 4.7v2.66H7.08v3.49h3.05V24c.61.09 1.23.14 1.87.14s1.26-.05 1.87-.14v-8.44h2.8z"
      />
    </svg>
  );
}

export default function Signup() {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<OAuthProvider | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getCachedSession().then((session) => {
      if (session) {
        appApi
          .getBootstrap()
          .then((bootstrap) => {
            navigate(bootstrap.profile?.onboardingCompleted ? '/dashboard/home' : '/onboarding/plans');
          })
          .catch(() => {
            navigate('/dashboard/home');
          });
      }
    });
  }, [navigate]);

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setError('Sign up is not configured yet. Add the required authentication values in Settings > Secrets.');
      return;
    }

    if (supabaseUrl === 'YOUR_SUPABASE_PROJECT_URL' || supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
      setError('Replace the placeholder authentication values in Settings > Secrets before creating an account.');
      return;
    }

    if (hasTurnstileSiteKey && !captchaToken) {
      setError('Complete the security check before creating your account.');
      return;
    }

    setIsLoading(true);

    try {
      // Add a timeout to prevent infinite spinning if the network hangs
      const signupPromise = supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
          captchaToken: captchaToken || undefined,
        }
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out. Please check your internet connection and try again.')), 15000)
      );

      const { data, error } = await Promise.race([signupPromise, timeoutPromise]) as any;

      if (error) {
        throw error;
      }

      if (data?.user && !data?.session) {
        // Email confirmation required
        setError('Success! Please check your email to verify your account before logging in.');
        setCaptchaToken(null);
        setCaptchaResetKey((current) => current + 1);
      } else if (data?.user) {
        // Successful signup and auto-login - redirect to onboarding
        navigate('/onboarding/plans');
      } else {
        throw new Error('An unexpected error occurred during sign up.');
      }
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err?.message || 'Failed to sign up. Please try again.');
      setCaptchaResetKey((current) => current + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignup = async (provider: OAuthProvider) => {
    setError('');

    if (hasTurnstileSiteKey && !captchaToken) {
      setError(`Complete the security check before continuing with ${provider === 'google' ? 'Google' : 'Facebook'}.`);
      return;
    }

    setOauthLoadingProvider(provider);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/signup`,
          ...(provider === 'google'
            ? {
                queryParams: {
                  prompt: 'select_account',
                },
              }
            : {}),
          ...(captchaToken ? { captchaToken } : {}),
        } as any,
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      console.error(`${provider} signup error:`, err);
      setError(
        err?.message ||
          `Failed to start ${provider === 'google' ? 'Google' : 'Facebook'} sign up. Please try again.`,
      );
      setOauthLoadingProvider(null);
      setCaptchaResetKey((current) => current + 1);
    }
  };

  return (
    <div className="min-h-screen bg-[#25DA7B] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white w-full max-w-5xl rounded-[2.5rem] flex flex-col md:flex-row overflow-hidden shadow-2xl md:min-h-[600px]"
      >
        
        {/* Left Side - Form */}
        <div className="w-full md:w-1/2 p-6 sm:p-10 lg:p-16 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2 sm:text-3xl">Create an account</h1>
              <p className="text-gray-500 text-sm">Join Connektly today.</p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 p-3 text-sm rounded-lg text-center ${
                  error.includes('Success!') 
                    ? 'bg-green-50 text-green-700 border border-green-200' 
                    : 'bg-red-50 text-red-600 border border-red-100'
                }`}
              >
                {error}
              </motion.div>
            )}

            <form className="space-y-4" onSubmit={handleSignup}>
              {/* Name Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-6 pr-12 py-3 rounded-full border border-gray-200 focus:outline-none focus:border-[#243bb5] focus:ring-1 focus:ring-[#243bb5] transition-colors text-sm"
                  required
                />
                <User className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              </div>

              {/* Email Input */}
              <div className="relative">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-6 pr-12 py-3 rounded-full border border-gray-200 focus:outline-none focus:border-[#243bb5] focus:ring-1 focus:ring-[#243bb5] transition-colors text-sm"
                  required
                />
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              </div>

              {/* Password Input */}
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-6 pr-12 py-3 rounded-full border border-gray-200 focus:outline-none focus:border-[#243bb5] focus:ring-1 focus:ring-[#243bb5] transition-colors text-sm"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Terms */}
              <div className="text-[10px] text-gray-500 mt-4 mb-6 leading-relaxed">
                By signing up, you agree to the Terms & Conditions and Privacy Policy, and consent to receive marketing communications from Connektly and our service partners. 
                Your information will also be shared with Connektly's Service Partners to facilitate your Connektly signup, product inquiries and enable your use of the Wati service.
              </div>

              {hasTurnstileSiteKey ? (
                <TurnstileWidget
                  siteKey={clientConfig.turnstile.siteKey}
                  isLocalhost={clientConfig.turnstile.isLocalhost}
                  token={captchaToken}
                  onTokenChange={setCaptchaToken}
                  resetKey={captchaResetKey}
                />
              ) : null}

              {/* Signup Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#1a2d94] hover:bg-[#15247a] text-white py-3 rounded-full font-medium transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg mt-2 flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign Up'}
              </button>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleOAuthSignup('google')}
                  disabled={oauthLoadingProvider !== null}
                  className="w-full rounded-full border border-gray-200 bg-white py-3 font-medium text-gray-800 transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm disabled:opacity-70 disabled:hover:translate-y-0"
                >
                  <span className="flex items-center justify-center gap-2">
                    {oauthLoadingProvider === 'google' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <GoogleIcon />
                    )}
                    Google
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleOAuthSignup('facebook')}
                  disabled={oauthLoadingProvider !== null}
                  className="w-full rounded-full border border-gray-200 bg-white py-3 font-medium text-gray-800 transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm disabled:opacity-70 disabled:hover:translate-y-0"
                >
                  <span className="flex items-center justify-center gap-2">
                    {oauthLoadingProvider === 'facebook' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <FacebookIcon />
                    )}
                    Facebook
                  </span>
                </button>
              </div>
            </form>
            
            <div className="mt-8 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-[#243bb5] font-medium hover:underline transition-colors">
                Log in
              </Link>
            </div>
          </div>
        </div>

        {/* Right Side - Image */}
        <div className="hidden md:block w-1/2 p-4">
          <div className="w-full h-full rounded-[2rem] overflow-hidden relative bg-[#25D366]/10">
            <motion.img 
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              src={loginImage}
              alt="Connektly Hub" 
              className="w-full h-full object-contain p-8"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

      </motion.div>
    </div>
  );
}
