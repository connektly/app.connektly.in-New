import { motion } from 'motion/react';
import { ExternalLink, History, Info, MessageSquare, Wallet } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';

export default function WhatsAppCredits() {
  const { bootstrap } = useAppData();
  const credits = bootstrap?.credits;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Credits</h1>
        <p className="text-gray-500 text-sm mt-1">
          This page now reads from the persisted workspace credit ledger instead of hardcoded demo values.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-[#111827] to-[#1f2937] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-[#5b45ff] rounded-full blur-3xl opacity-50 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-gray-300 mb-8">
                <Wallet className="w-5 h-5" />
                <span className="text-sm font-medium">Available Balance</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold tracking-tight">
                  {credits?.currency || 'USD'} {credits?.balance.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="text-sm text-gray-300">
                Plug your billing or top-up backend into the `credit_ledger` table to make this fully automatic.
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-blue-900">How WhatsApp Pricing Works</h4>
                <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                  Meta charges per conversation window. This dashboard stores your internal balance and ledger, but the actual billing feed still needs to come from your payment backend or BSP reconciliation job.
                </p>
                <a href="https://developers.facebook.com/docs/whatsapp/pricing/" target="_blank" rel="noreferrer" className="text-xs font-bold text-[#5b45ff] mt-2 inline-flex items-center gap-1 hover:underline">
                  View Meta Pricing <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-bold text-gray-900">Credit Usage History</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                  <th className="p-4 pl-6 font-medium">Transaction</th>
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 pr-6 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(credits?.ledger || []).map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          item.type === 'addition' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{item.description}</p>
                          <p className="text-xs text-gray-500 capitalize">{item.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-500">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="p-4 pr-6 text-right">
                      <span className={`text-sm font-bold ${item.type === 'addition' ? 'text-green-600' : 'text-gray-900'}`}>
                        {item.type === 'addition' ? '+' : '-'}
                        {item.currency} {item.amount.toFixed(4)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(credits?.ledger || []).length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No credit ledger entries yet. Populate `credit_ledger` from your billing backend to make this live.
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
