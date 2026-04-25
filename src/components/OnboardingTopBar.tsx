import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import BrandMark from './BrandMark';

export default function OnboardingTopBar() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 py-4 sm:px-8">
      <div className="flex items-center gap-3">
        <BrandMark className="h-10 w-10" />
        <span className="text-sm font-semibold tracking-tight text-gray-900">Connektly</span>
      </div>

      <button
        onClick={() => void handleSignOut()}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
