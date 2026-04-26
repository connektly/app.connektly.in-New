import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  HelpCircle,
  Info,
  Loader2,
  MessageCircle,
  Server,
  ShieldAlert,
  Smartphone,
  X,
} from 'lucide-react';
import { appApi } from '../lib/api';
import { hasEmbeddedSignupConfig } from '../lib/config';
import { beginEmbeddedSignup } from '../lib/meta-sdk';
import { useAppData } from '../context/AppDataContext';
import OnboardingTopBar from '../components/OnboardingTopBar';

export default function ChannelConnection() {
  const navigate = useNavigate();
  const { bootstrap, refresh } = useAppData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [setupType, setSetupType] = useState<'exclusive' | 'coexistence' | null>(null);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [has2FADisabled, setHas2FADisabled] = useState<boolean | null>(null);
  const [connectMethod, setConnectMethod] = useState<'manual' | null>(null);
  const [manualData, setManualData] = useState({ token: '', wabaId: '', phoneId: '' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingChannel = bootstrap?.channel || null;
  const primaryActionLabel = useMemo(() => {
    if (!existingChannel) {
      return 'Connect WhatsApp';
    }

    return existingChannel.displayPhoneNumber
      ? `Connected: ${existingChannel.displayPhoneNumber}`
      : 'WhatsApp connected';
  }, [existingChannel]);

  const resetModal = () => {
    setStep(1);
    setSetupType(null);
    setHasAdmin(null);
    setHas2FADisabled(null);
    setConnectMethod(null);
    setManualData({ token: '', wabaId: '', phoneId: '' });
    setError(null);
    setIsConnecting(false);
    setIsModalOpen(false);
  };

  const finishOnboarding = async () => {
    await appApi.saveProfile({
      onboardingCompleted: true,
    });
    await refresh();
    navigate('/dashboard/home');
  };

  const handleConnectMeta = async () => {
    if (!setupType) {
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      const embeddedSession = await beginEmbeddedSignup();
      await appApi.connectMetaEmbedded({
        setupType,
        code: embeddedSession.code,
        wabaId: embeddedSession.wabaId,
        phoneNumberId: embeddedSession.phoneNumberId,
        redirectUri: embeddedSession.redirectUri,
      });
      await refresh();
      setStep(4);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Meta connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleManualSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!setupType) {
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      await appApi.connectMetaManually({
        setupType,
        accessToken: manualData.token.trim(),
        wabaId: manualData.wabaId.trim(),
        phoneNumberId: manualData.phoneId.trim(),
      });
      await refresh();
      setStep(4);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Manual Meta connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] py-20 px-4 sm:px-6 lg:px-8 font-sans overflow-hidden relative">
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
          className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-gradient-to-t from-[#25D366]/5 to-transparent blur-3xl"
        />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">
            Connect your real WhatsApp environment
          </h1>
          <p className="text-gray-500">
            This step stores your production channel details and syncs templates into the dashboard.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="bg-white rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col h-full"
          >
            <div className="w-16 h-16 bg-[#25D366]/10 text-[#25D366] rounded-2xl flex items-center justify-center mb-6">
              <MessageCircle className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">WhatsApp Business</h3>
            <p className="text-gray-500 mb-8 flex-grow">
              Use Meta embedded signup or connect manually with a token, WABA ID, and phone number ID.
            </p>
            {existingChannel ? (
              <div className="mb-5 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
                {primaryActionLabel}
                {existingChannel.verifiedName ? ` • ${existingChannel.verifiedName}` : ''}
              </div>
            ) : null}
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full py-4 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-[#25D366]/30 transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              {existingChannel ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-white rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col h-full"
          >
            <div className="w-16 h-16 bg-gray-100 text-gray-600 rounded-2xl flex items-center justify-center mb-6">
              <ArrowRight className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Setup Later</h3>
            <p className="text-gray-500 mb-8 flex-grow">
              Skip the Meta connection for now. The app will stay usable, but inbox, templates, and live WhatsApp status remain empty until you connect a real account.
            </p>
            <button
              onClick={() => void finishOnboarding()}
              className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-medium transition-all duration-300"
            >
              Proceed to Dashboard
            </button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center"
        >
          <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6">
            Need help before you connect?
          </h4>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700">
              <Calendar className="w-4 h-4" /> Book a Demo
            </button>
            <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700">
              <MessageCircle className="w-4 h-4" /> Talk to Connektly on WhatsApp
            </button>
            <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700">
              <HelpCircle className="w-4 h-4" /> Read setup docs
            </button>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {isModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetModal}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white sticky top-0 z-20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#25D366]/10 text-[#25D366] rounded-xl flex items-center justify-center">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">WhatsApp Setup</h2>
                    <p className="text-xs text-gray-500 font-medium">Step {step} of 4</p>
                  </div>
                </div>
                <button onClick={resetModal} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-grow bg-[#fafafa]">
                <AnimatePresence mode="wait">
                  {step === 1 ? (
                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                      <div className="mb-8">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">
                          Choose the WhatsApp setup that fits your business
                        </h3>
                        <p className="text-gray-500">
                          This is stored with the channel record so your workspace reflects how the phone should be operated.
                        </p>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <button
                          onClick={() => setSetupType('exclusive')}
                          className={`text-left p-6 rounded-2xl border-2 transition-all duration-300 ${
                            setupType === 'exclusive'
                              ? 'border-[#5b45ff] bg-[#5b45ff]/5'
                              : 'border-gray-200 bg-white hover:border-[#5b45ff]/50'
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${setupType === 'exclusive' ? 'bg-[#5b45ff] text-white' : 'bg-gray-100 text-gray-600'}`}>
                            <Server className="w-6 h-6" />
                          </div>
                          <h4 className="font-bold text-gray-900 mb-2">Use WhatsApp exclusively through Connektly</h4>
                          <p className="text-sm text-gray-500">
                            Your team manages customer conversations directly from Connektly.
                          </p>
                        </button>

                        <button
                          onClick={() => setSetupType('coexistence')}
                          className={`text-left p-6 rounded-2xl border-2 transition-all duration-300 ${
                            setupType === 'coexistence'
                              ? 'border-[#5b45ff] bg-[#5b45ff]/5'
                              : 'border-gray-200 bg-white hover:border-[#5b45ff]/50'
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${setupType === 'coexistence' ? 'bg-[#5b45ff] text-white' : 'bg-gray-100 text-gray-600'}`}>
                            <Smartphone className="w-6 h-6" />
                          </div>
                          <h4 className="font-bold text-gray-900 mb-2">Keep WhatsApp on your phone too</h4>
                          <p className="text-sm text-gray-500">
                            Connektly stays connected while your team also uses the phone app in coexistence mode.
                          </p>
                        </button>
                      </div>

                      <div className="pt-6 flex justify-end">
                        <button
                          disabled={!setupType}
                          onClick={() => setStep(2)}
                          className={`px-8 py-3 rounded-xl font-medium transition-all ${
                            setupType
                              ? 'bg-[#5b45ff] hover:bg-[#4a35e8] text-white shadow-lg shadow-[#5b45ff]/30'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          Proceed to Step 2
                        </button>
                      </div>
                    </motion.div>
                  ) : null}

                  {step === 2 ? (
                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                      <div className="mb-6">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Check requirements</h3>
                        <p className="text-gray-500">Make sure the Meta side is ready before starting the real connection flow.</p>
                      </div>

                      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                        <h4 className="font-bold text-gray-900 mb-2">
                          Requirement 1: do you have admin access to the Meta Business Portfolio?
                        </h4>
                        <p className="text-sm text-gray-500 mb-4">
                          You need Meta admin access before the embedded signup or manual token flow can succeed.
                        </p>

                        <div className="flex flex-wrap gap-3 mb-6">
                          <button
                            onClick={() => setHasAdmin(true)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              hasAdmin === true
                                ? 'bg-[#5b45ff] text-white border-[#5b45ff]'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            Yes, I have admin access
                          </button>
                          <button
                            onClick={() => setHasAdmin(false)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              hasAdmin === false
                                ? 'bg-red-500 text-white border-red-500'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            No, I am not the admin
                          </button>
                        </div>

                        {hasAdmin === false ? (
                          <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex gap-3 text-red-800 mb-4">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <p className="text-sm">
                              Ask a Meta Business admin to complete this step or provide the manual connection values.
                            </p>
                          </div>
                        ) : null}

                        <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
                          <h5 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Info className="w-4 h-4" />
                            How to check
                          </h5>
                          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
                            <li>Open Meta Business Suite.</li>
                            <li>Go to Settings and then People.</li>
                            <li>Confirm your role has admin or full control access.</li>
                          </ol>
                        </div>
                      </div>

                      {hasAdmin === true ? (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                          <h4 className="font-bold text-gray-900 mb-2">
                            Requirement 2: if you are migrating, is Meta two-factor authentication disabled for this setup step?
                          </h4>

                          <div className="flex flex-wrap gap-3 my-4">
                            <button
                              onClick={() => setHas2FADisabled(true)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                has2FADisabled === true
                                  ? 'bg-[#5b45ff] text-white border-[#5b45ff]'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              Yes, it is disabled
                            </button>
                            <button
                              onClick={() => setHas2FADisabled(false)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                has2FADisabled === false
                                  ? 'bg-gray-800 text-white border-gray-800'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              No
                            </button>
                          </div>
                        </motion.div>
                      ) : null}

                      <div className="pt-2 flex justify-between">
                        <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                          Back
                        </button>
                        <button
                          disabled={hasAdmin !== true || has2FADisabled === null}
                          onClick={() => setStep(3)}
                          className={`px-8 py-3 rounded-xl font-medium transition-all ${
                            hasAdmin === true && has2FADisabled !== null
                              ? 'bg-[#5b45ff] hover:bg-[#4a35e8] text-white shadow-lg shadow-[#5b45ff]/30'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          Proceed
                        </button>
                      </div>
                    </motion.div>
                  ) : null}

                  {step === 3 ? (
                    <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                      <div className="mb-8 text-center">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <ShieldAlert className="w-8 h-8" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Connect your production Meta account</h3>
                        <p className="text-gray-500">
                          Use embedded signup if your app and Meta configuration are ready. Otherwise connect manually with a long-lived token.
                        </p>
                      </div>

                      {error ? (
                        <div className="max-w-lg mx-auto rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {error}
                        </div>
                      ) : null}

                      {!connectMethod ? (
                        <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-lg mx-auto">
                          <button
                            onClick={() => void handleConnectMeta()}
                            disabled={isConnecting || !hasEmbeddedSignupConfig}
                            className="flex-1 py-4 px-6 bg-[#1877F2] hover:bg-[#166fe5] text-white rounded-xl font-medium transition-all shadow-lg shadow-[#1877F2]/30 flex items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {hasEmbeddedSignupConfig ? 'Connect on Meta' : 'Embedded signup not configured'}
                          </button>
                          <button
                            onClick={() => setConnectMethod('manual')}
                            disabled={isConnecting}
                            className="flex-1 py-4 px-6 bg-white border-2 border-gray-200 hover:border-[#5b45ff] hover:text-[#5b45ff] text-gray-700 rounded-xl font-medium transition-all"
                          >
                            Connect Manually
                          </button>
                        </div>
                      ) : (
                        <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleManualSubmit} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-lg mx-auto space-y-4">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-gray-900">Manual Connection</h4>
                            <button type="button" onClick={() => setConnectMethod(null)} className="text-sm text-[#5b45ff] hover:underline">
                              Cancel
                            </button>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Long-lived access token</label>
                            <input
                              type="text"
                              required
                              value={manualData.token}
                              onChange={(event) => setManualData((current) => ({ ...current, token: event.target.value }))}
                              className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff] outline-none text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">WABA ID</label>
                            <input
                              type="text"
                              required
                              value={manualData.wabaId}
                              onChange={(event) => setManualData((current) => ({ ...current, wabaId: event.target.value }))}
                              className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff] outline-none text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number ID</label>
                            <input
                              type="text"
                              required
                              value={manualData.phoneId}
                              onChange={(event) => setManualData((current) => ({ ...current, phoneId: event.target.value }))}
                              className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff] outline-none text-sm"
                            />
                          </div>
                          <button type="submit" disabled={isConnecting} className="w-full py-3 mt-2 bg-[#5b45ff] text-white rounded-lg font-medium hover:bg-[#4a35e8] transition-colors disabled:opacity-60">
                            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" /> : null}
                            Verify and connect
                          </button>
                        </motion.form>
                      )}

                      <div className="pt-6 flex justify-start max-w-lg mx-auto">
                        <button onClick={() => setStep(2)} className="px-6 py-2 rounded-xl font-medium text-gray-600 hover:bg-gray-200 transition-colors text-sm">
                          Back to requirements
                        </button>
                      </div>
                    </motion.div>
                  ) : null}

                  {step === 4 ? (
                    <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="text-center py-12">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                        className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6"
                      >
                        <CheckCircle2 className="w-12 h-12" />
                      </motion.div>
                      <h3 className="text-3xl font-bold text-gray-900 mb-4">Connected successfully</h3>
                      <p className="text-gray-500 max-w-md mx-auto mb-10">
                        Your WhatsApp Business number is stored in the workspace and templates are ready to sync into the dashboard.
                      </p>
                      <button
                        onClick={() => void finishOnboarding()}
                        className="px-8 py-4 bg-[#5b45ff] hover:bg-[#4a35e8] text-white rounded-xl font-medium transition-all shadow-lg shadow-[#5b45ff]/30 transform hover:-translate-y-0.5"
                      >
                        Proceed to Dashboard
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
