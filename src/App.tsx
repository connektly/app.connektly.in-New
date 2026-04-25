/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getCachedSession, supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Plans from './pages/Plans';
import OnboardingCompany from './pages/OnboardingCompany';
import OnboardingIndustry from './pages/OnboardingIndustry';
import OnboardingProfile from './pages/OnboardingProfile';
import ChannelConnection from './pages/ChannelConnection';
import InstagramAuthCallback from './pages/InstagramAuthCallback';

// Dashboard Components
import DashboardLayout from './layouts/DashboardLayout';
import Home from './pages/dashboard/Home';
import Inbox from './pages/dashboard/Inbox';
import Settings from './pages/dashboard/Settings';
import Calls from './pages/dashboard/Calls';
import WhatsAppCredits from './pages/dashboard/WhatsAppCredits';
import Templates from './pages/dashboard/Templates';
import Broadcasts from './pages/dashboard/Broadcasts';
import Contacts from './pages/dashboard/Contacts';
import LeadList from './pages/dashboard/LeadList';
import BusinessProfile from './pages/dashboard/BusinessProfile';
import Catalog from './pages/dashboard/Catalog';
import Channels from './pages/dashboard/Channels';
import Insights from './pages/dashboard/Insights';
import Integrations from './pages/dashboard/Integrations';
import Notifications from './pages/dashboard/Notifications';
import Automations from './pages/dashboard/Automations';
import DeveloperTools from './pages/dashboard/DeveloperTools';
import Emails from './pages/dashboard/Emails';

// Placeholder component for unimplemented dashboard routes
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <h2 className="text-2xl font-bold text-gray-400 mb-2">{title}</h2>
      <p className="text-gray-500 text-sm">This feature is coming soon.</p>
    </div>
  </div>
);

const RootRoute = ({ session }: { session: Session | null }) => {
  return session ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
};

const ProtectedRoute = ({ children, session }: { children: ReactNode, session: Session | null }) => {
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const ProtectedApp = ({ session }: { session: Session | null }) => (
  <ProtectedRoute session={session}>
    <AppDataProvider>
      <Outlet />
    </AppDataProvider>
  </ProtectedRoute>
);

const GuardLoading = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-[#5b45ff] animate-spin" />
  </div>
);

function getRequiredOnboardingPath(bootstrap: ReturnType<typeof useAppData>['bootstrap']) {
  const profile = bootstrap?.profile;

  if (!profile?.selectedPlan) {
    return '/onboarding/plans';
  }

  if (!profile.companyName || !profile.companyWebsite) {
    return '/onboarding';
  }

  if (!profile.industry) {
    return '/onboarding/industry';
  }

  if (!profile.fullName || !profile.phone || !profile.countryCode) {
    return '/onboarding/profile';
  }

  if (!profile.onboardingCompleted) {
    return '/onboarding/channel-connection';
  }

  return null;
}

const OnboardingRouteGuard = () => {
  const { bootstrap, isLoading } = useAppData();
  const location = useLocation();

  if (isLoading) {
    return <GuardLoading />;
  }

  const requiredPath = getRequiredOnboardingPath(bootstrap);
  const canAccessOptionalChannelConnection =
    location.pathname === '/onboarding/channel-connection' &&
    Boolean(bootstrap?.profile?.onboardingCompleted) &&
    !bootstrap?.channel;

  if (!requiredPath) {
    if (canAccessOptionalChannelConnection) {
      return <Outlet />;
    }

    return <Navigate to="/dashboard/home" replace />;
  }

  if (location.pathname !== requiredPath) {
    return <Navigate to={requiredPath} replace />;
  }

  return <Outlet />;
};

const DashboardRouteGuard = () => {
  const { bootstrap, isLoading } = useAppData();

  if (isLoading) {
    return <GuardLoading />;
  }

  const requiredPath = getRequiredOnboardingPath(bootstrap);

  if (requiredPath) {
    return <Navigate to={requiredPath} replace />;
  }

  return <Outlet />;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCachedSession().then((session) => {
      setSession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#5b45ff] animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRoute session={session} />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/instagram/callback" element={<InstagramAuthCallback />} />

        <Route element={<ProtectedApp session={session} />}>
          <Route element={<OnboardingRouteGuard />}>
            <Route path="/onboarding/plans" element={<Plans />} />
            <Route path="/onboarding" element={<OnboardingCompany />} />
            <Route path="/onboarding/industry" element={<OnboardingIndustry />} />
            <Route path="/onboarding/profile" element={<OnboardingProfile />} />
            <Route path="/onboarding/channel-connection" element={<ChannelConnection />} />
          </Route>

          <Route element={<DashboardRouteGuard />}>
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Navigate to="/dashboard/home" replace />} />
              <Route path="home" element={<Home />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="analytics" element={<Navigate to="/dashboard/home" replace />} />
              <Route path="insights" element={<Insights />} />
              <Route path="calls" element={<Calls />} />
              <Route path="leads" element={<LeadList />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="templates" element={<Templates />} />
              <Route path="campaigns" element={<Broadcasts />} />
              <Route path="broadcasts" element={<Navigate to="/dashboard/campaigns" replace />} />
              <Route path="flows" element={<Navigate to="/dashboard/automations/flows" replace />} />
              <Route path="automations" element={<Automations />} />
              <Route path="automations/flows" element={<Placeholder title="Flows" />} />
              <Route path="automations/triggers" element={<Automations />} />
              <Route path="commerce" element={<Navigate to="/dashboard/commerce/catalog" replace />} />
              <Route path="commerce/catalog" element={<Catalog />} />
              <Route path="profile" element={<BusinessProfile />} />
              <Route path="channels" element={<Channels />} />
              <Route path="channels/meta" element={<Channels />} />
              <Route path="channels/other" element={<Channels />} />
              <Route path="channel-status" element={<Channels />} />
              <Route path="crm/analytics" element={<Placeholder title="CRM Analytics" />} />
              <Route path="crm/reports" element={<Placeholder title="CRM Reports" />} />
              <Route path="crm/leads" element={<Navigate to="/dashboard/leads" replace />} />
              <Route path="crm/pipeline" element={<Placeholder title="Pipeline" />} />
              <Route path="crm/meta-lead-capture" element={<Navigate to="/dashboard/integrations/meta-lead-capture" replace />} />
              <Route path="credits/whatsapp" element={<WhatsAppCredits />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="integrations/meta-lead-capture" element={<Navigate to="/dashboard/integrations?integration=meta-lead-capture" replace />} />
              <Route path="emails" element={<Emails />} />
              <Route path="emails/inbox" element={<Emails />} />
              <Route path="emails/template-builder" element={<Emails />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="developer" element={<DeveloperTools />} />
              <Route path="developer/api" element={<DeveloperTools />} />
              <Route path="developer/webhook" element={<DeveloperTools />} />
              <Route path="help" element={<Placeholder title="Help and Support" />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
