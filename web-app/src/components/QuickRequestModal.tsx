import { useState, useEffect } from 'react';
import { X, Zap, MapPin, Star, Clock, CheckCircle2, ChevronRight, AlertTriangle, Phone, Search, Wrench, ShieldCheck, BatteryCharging, Car, ArrowLeft } from 'lucide-react';
import { marketplaceAPI } from '../services/api';

const PROBLEMS = [
  { id: 'wont-start',  label: 'Не заводится', icon: AlertTriangle },
  { id: 'tow',         label: 'Эвакуатор',    icon: Phone },
  { id: 'diagnostics', label: 'Диагностика',  icon: Search },
  { id: 'oil',         label: 'Замена масла', icon: Wrench },
  { id: 'brakes',      label: 'Тормоза',      icon: ShieldCheck },
  { id: 'electric',    label: 'Электрика',    icon: Zap },
  { id: 'battery',     label: 'Прикурить',    icon: BatteryCharging },
  { id: 'suspension',  label: 'Подвеска',     icon: Car },
];

type Step = 'select' | 'matching' | 'result' | 'confirmed';

export default function QuickRequestModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('select');
  const [selectedProblem, setSelectedProblem] = useState<string | null>(null);
  const [matchProgress, setMatchProgress] = useState(0);
  const [provider, setProvider] = useState<any>(null);

  useEffect(() => {
    if (step === 'matching') {
      setMatchProgress(0);
      const i = setInterval(() => setMatchProgress(p => (p >= 100 ? 100 : p + 4)), 80);
      return () => clearInterval(i);
    }
  }, [step]);

  useEffect(() => {
    if (isOpen) { setStep('select'); setSelectedProblem(null); setProvider(null); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectProblem = async (id: string) => {
    setSelectedProblem(id);
    setStep('matching');
    try {
      const { data } = await marketplaceAPI.quickRequest({ problem: id, lat: 50.4501, lng: 30.5234 });
      setProvider(data.provider);
      setTimeout(() => setStep('result'), 1500);
    } catch (e) {
      setTimeout(() => setStep('result'), 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 modal-backdrop" onClick={onClose} data-testid="quick-request-modal">
      <div
        className="modal-content relative w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
        data-testid="quick-request-content"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 surface-chip flex items-center justify-center hover:border-amber transition-colors"
          style={{ borderRadius: 999 }}
          data-testid="quick-close"
        >
          <X size={16} className="text-amber" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="slash-label mb-2">БЫСТРЫЙ ЗАПРОС</div>
          <h3 className="font-display tracking-bebas text-3xl">
            {step === 'select' && 'ЧТО СЛУЧИЛОСЬ?'}
            {step === 'matching' && 'ИЩЕМ МАСТЕРА…'}
            {step === 'result' && 'МАСТЕР НАЙДЕН'}
            {step === 'confirmed' && 'ЗАЯВКА ПРИНЯТА'}
          </h3>
        </div>

        {step === 'select' && (
          <div className="grid grid-cols-2 gap-2" data-testid="problem-grid">
            {PROBLEMS.map(p => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectProblem(p.id)}
                  className="card-interactive flex items-center gap-3 !p-4"
                  data-testid={`q-problem-${p.id}`}
                >
                  <span className="icon-badge-soft !w-9 !h-9"><Icon size={16} /></span>
                  <span className="text-sm font-semibold text-left">{p.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === 'matching' && (
          <div className="py-6 text-center">
            <div className="relative w-32 h-32 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full bg-amber/15 animate-amber-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Zap size={40} className="text-amber" fill="currentColor" />
              </div>
            </div>
            <p className="text-sm mb-3" style={{ color: '#B8B8B8' }}>
              Подбираем ближайшего проверенного мастера
            </p>
            <div className="surface-chip h-1.5 overflow-hidden" style={{ borderRadius: 999 }}>
              <div className="h-full bg-amber transition-all duration-200" style={{ width: `${matchProgress}%` }} />
            </div>
          </div>
        )}

        {step === 'result' && provider && (
          <div className="space-y-4" data-testid="quick-result">
            <div className="card !p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-display tracking-bebas text-2xl">{provider.name}</h4>
                  <div className="flex items-center gap-3 text-xs mt-1" style={{ color: '#8A8A8A' }}>
                    <span className="flex items-center gap-1"><Star size={11} className="text-amber" fill="currentColor" /> {provider.ratingAvg}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><MapPin size={11} className="text-amber" /> {provider.distanceKm} км</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Clock size={11} className="text-amber" /> {provider.etaMinutes} мин</span>
                  </div>
                </div>
                <span className="badge badge-solid">МАТЧ</span>
              </div>
              <div className="hairline-t pt-3 flex justify-between items-center">
                <div>
                  <div className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>Цена</div>
                  <div className="font-display tracking-bebas text-2xl text-amber">{provider.priceFrom ?? 500} ₴</div>
                </div>
                <button onClick={() => setStep('confirmed')} className="btn-primary" data-testid="quick-confirm">
                  Подтвердить <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <button onClick={() => setStep('select')} className="btn-ghost w-full" data-testid="quick-back">
              <ArrowLeft size={14} /> Назад
            </button>
          </div>
        )}

        {step === 'confirmed' && (
          <div className="py-6 text-center" data-testid="quick-confirmed">
            <div className="icon-badge-soft !w-16 !h-16 mx-auto mb-4">
              <CheckCircle2 size={28} className="text-amber" />
            </div>
            <h4 className="font-display tracking-bebas text-2xl mb-2">МАСТЕР ВЫЕХАЛ</h4>
            <p className="text-sm mb-6" style={{ color: '#B8B8B8' }}>
              Прибудет через ~{provider?.etaMinutes ?? 6} минут. Уведомления приходят на телефон.
            </p>
            <button onClick={onClose} className="btn-secondary w-full">Закрыть</button>
          </div>
        )}
      </div>
    </div>
  );
}
