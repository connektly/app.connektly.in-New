import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useAppData } from '../../context/AppDataContext';
import InboxInsightsSection from '../../components/dashboard/InboxInsightsSection';

export default function Home() {
  const { bootstrap } = useAppData();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const hour = currentTime.getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';

  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const userName = bootstrap?.profile?.fullName || 'User';

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-8 sm:p-10 shadow-sm border border-gray-100 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-gradient-to-br from-[#5b45ff]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <p className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-2">
            <span>{formattedDate}</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span>{formattedTime}</span>
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {userName}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Live channel state is now driven from your workspace profile and the connected Meta account.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <InboxInsightsSection />
      </motion.div>
    </div>
  );
}
