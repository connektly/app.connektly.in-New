import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Briefcase, Loader2 } from 'lucide-react';
import { appApi } from '../lib/api';
import { useAppData } from '../context/AppDataContext';
import OnboardingTopBar from '../components/OnboardingTopBar';

const INDUSTRIES = [
  'Retail and e-commerce',
  'Healthcare, beauty and wellness',
  'Professional Services',
  'Technology and Software',
  'Food and Beverage',
  'Education and Training',
  'Real Estate',
  'Manufacturing and Logistics',
  'Other',
];

export default function OnboardingIndustry() {
  const navigate = useNavigate();
  const { bootstrap, refresh } = useAppData();
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIndustry(bootstrap?.profile?.industry || '');
  }, [bootstrap?.profile?.industry]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedIndustry) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await appApi.saveProfile({
        industry: selectedIndustry,
      });
      await refresh();
      navigate('/onboarding/profile');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save your industry.');
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
        className="bg-white w-full max-w-3xl rounded-[2rem] border border-gray-100 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10 sm:p-12"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 15 }}
            className="w-16 h-16 bg-[#5b45ff]/10 text-[#5b45ff] rounded-2xl flex items-center justify-center mx-auto mb-6"
          >
            <Briefcase className="w-8 h-8" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-2xl font-bold text-gray-900 mb-3 tracking-tight sm:text-3xl"
          >
            What best describes your company?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="text-gray-500"
          >
            Choose the industry that will be used for onboarding defaults and CRM labeling.
          </motion.p>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="flex flex-wrap justify-center gap-3">
            {INDUSTRIES.map((industry) => (
              <motion.button
                key={industry}
                type="button"
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                onClick={() => setSelectedIndustry(industry)}
                className={`px-4 py-3 sm:px-6 rounded-full text-sm font-medium transition-all duration-300 border ${
                  selectedIndustry === industry
                    ? 'bg-[#5b45ff] text-white border-[#5b45ff] shadow-md shadow-[#5b45ff]/20 scale-105'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#5b45ff]/50 hover:bg-gray-50'
                }`}
              >
                {industry}
              </motion.button>
            ))}
          </div>

          <div className="pt-4 max-w-md mx-auto">
            <button
              type="submit"
              disabled={!selectedIndustry || isSaving}
              className={`w-full py-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                selectedIndustry && !isSaving
                  ? 'bg-[#5b45ff] hover:bg-[#4a35e8] text-white shadow-lg shadow-[#5b45ff]/30 transform hover:-translate-y-0.5'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Continue
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
