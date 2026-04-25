import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, Phone, User } from 'lucide-react';
import { appApi } from '../lib/api';
import { useAppData } from '../context/AppDataContext';
import OnboardingTopBar from '../components/OnboardingTopBar';

const COUNTRIES = [
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+91', label: 'IN +91' },
  { code: '+61', label: 'AU +61' },
  { code: '+81', label: 'JP +81' },
  { code: '+49', label: 'DE +49' },
  { code: '+33', label: 'FR +33' },
];

export default function OnboardingProfile() {
  const navigate = useNavigate();
  const { bootstrap, refresh } = useAppData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(bootstrap?.profile?.fullName || '');
    setPhone(bootstrap?.profile?.phone || '');
    setCountryCode(bootstrap?.profile?.countryCode || '+1');
  }, [bootstrap?.profile?.countryCode, bootstrap?.profile?.fullName, bootstrap?.profile?.phone]);

  const isFormValid = name.trim() !== '' && phone.trim() !== '';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isFormValid) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await appApi.saveProfile({
        fullName: name.trim(),
        phone: phone.trim(),
        countryCode,
      });
      await refresh();
      navigate('/onboarding/channel-connection');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-start justify-center overflow-y-auto bg-[#fafafa] p-4 pt-24 font-sans sm:items-center sm:p-8">
      <OnboardingTopBar />
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-gradient-to-b from-[#5b45ff]/5 to-transparent blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
          className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-t from-[#5b45ff]/5 to-transparent blur-3xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white w-full max-w-2xl rounded-[2rem] border border-gray-100 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10 sm:p-12"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 15 }}
            className="w-16 h-16 bg-[#5b45ff]/10 text-[#5b45ff] rounded-2xl flex items-center justify-center mx-auto mb-6"
          >
            <User className="w-8 h-8" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-2xl font-bold text-gray-900 mb-3 tracking-tight sm:text-3xl"
          >
            One last step. Tell us about yourself
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="text-gray-500"
          >
            These details are stored and reused when messages, templates, and Meta connections are created.
          </motion.p>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="John Doe"
                className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gray-200 focus:outline-none focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff] transition-all duration-300 bg-gray-50 focus:bg-white"
                required
              />
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#5b45ff] transition-colors duration-300" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contact number <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative w-full shrink-0 sm:w-36">
                <select
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value)}
                  className="w-full appearance-none pl-4 pr-8 py-3.5 rounded-xl border border-gray-200 focus:outline-none focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff] transition-all duration-300 bg-gray-50 focus:bg-white text-gray-700 cursor-pointer"
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative group flex-1">
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="98765 43210"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gray-200 focus:outline-none focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff] transition-all duration-300 bg-gray-50 focus:bg-white"
                  required
                />
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#5b45ff] transition-colors duration-300" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="pt-4"
          >
            <button
              type="submit"
              disabled={!isFormValid || isSaving}
              className={`w-full py-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                isFormValid && !isSaving
                  ? 'bg-[#5b45ff] hover:bg-[#4a35e8] text-white shadow-lg shadow-[#5b45ff]/30 transform hover:-translate-y-0.5'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Continue to channel setup
            </button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
}
