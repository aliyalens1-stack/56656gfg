import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Clock, MapPin, Star, CheckCircle2, Calendar, MessageSquare, Zap, ArrowLeft, ChevronRight } from 'lucide-react';
import { marketplaceAPI } from '../services/api';

type Step = 'service' | 'slot' | 'comment' | 'confirm' | 'creating' | 'success';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  provider: any;
  onSuccess?: (booking: any) => void;
}

export default function BookingModal({ isOpen, onClose, provider, onSuccess }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('service');
  const [selectedService, setSelectedService] = useState('');
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<any>(null);

  const services = ['Компьютерная диагностика', 'Замена масла', 'Замена тормозных колодок', 'Ремонт подвески', 'Электрика', 'Другое'];

  useEffect(() => {
    if (isOpen) { setStep('service'); setSelectedService(''); setSelectedSlot(null); setComment(''); setBooking(null); }
  }, [isOpen]);

  useEffect(() => {
    if (step === 'slot' && provider?.slug) {
      setLoading(true);
      marketplaceAPI.getProviderSlots(provider.slug, selectedDate)
        .then(r => setSlots(r.data.slots || []))
        .catch(() => {
          const fb = [];
          for (let h = 9; h < 19; h++) for (const m of [0, 30]) fb.push({ time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, available: Math.random() > 0.3 });
          setSlots(fb);
        })
        .finally(() => setLoading(false));
    }
  }, [step, provider, selectedDate]);

  const submitBooking = async () => {
    setStep('creating');
    setLoading(true);
    try {
      const { data } = await marketplaceAPI.createBooking({
        providerId: provider.id,
        slug: provider.slug,
        service: selectedService,
        slot: selectedSlot,
        date: selectedDate,
        comment,
      });
      setBooking(data);
      setStep('success');
      onSuccess?.(data);
    } catch (e) {
      console.error(e);
      setStep('confirm');
    } finally { setLoading(false); }
  };

  if (!isOpen || !provider) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 modal-backdrop" onClick={onClose} data-testid="booking-modal">
      <div
        className="modal-content relative w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}
        data-testid="booking-content"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 surface-chip flex items-center justify-center hover:border-amber transition-colors"
          style={{ borderRadius: 999 }}
          data-testid="booking-close"
        >
          <X size={16} className="text-amber" />
        </button>

        <div className="mb-6">
          <div className="slash-label mb-2">БРОНИРОВАНИЕ</div>
          <h3 className="font-display tracking-bebas text-3xl">{provider.name}</h3>
          <div className="flex items-center gap-3 text-xs mt-1" style={{ color: '#8A8A8A' }}>
            <span className="flex items-center gap-1"><Star size={11} className="text-amber" fill="currentColor" /> {provider.ratingAvg ?? '4.7'}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><MapPin size={11} className="text-amber" /> {provider.distanceKm ?? '—'} км</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock size={11} className="text-amber" /> {provider.etaMinutes ?? '—'} мин</span>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 mb-6">
          {['service', 'slot', 'comment', 'confirm'].map((s, i) => {
            const idx = ['service', 'slot', 'comment', 'confirm', 'creating', 'success'].indexOf(step);
            return <div key={s} className={`h-1 flex-1 transition-colors ${idx >= i ? 'bg-amber' : 'bg-ink-300'}`} style={{ borderRadius: 999 }} />;
          })}
        </div>

        {step === 'service' && (
          <div className="space-y-2" data-testid="step-service">
            <label className="slash-label">УСЛУГА</label>
            <div className="grid grid-cols-1 gap-2 mt-3">
              {services.map(s => (
                <button
                  key={s}
                  onClick={() => { setSelectedService(s); setStep('slot'); }}
                  className="card-interactive flex items-center justify-between !p-4"
                  data-testid={`service-${s}`}
                >
                  <span className="text-sm font-semibold">{s}</span>
                  <ChevronRight size={16} className="text-amber" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'slot' && (
          <div className="space-y-3" data-testid="step-slot">
            <div className="flex items-center justify-between">
              <label className="slash-label">ВРЕМЯ</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="input-dark !w-auto !h-9 text-xs"
                data-testid="slot-date"
              />
            </div>
            {loading ? <div className="py-8 text-center text-sm" style={{ color: '#8A8A8A' }}>Загрузка слотов…</div> : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((sl, i) => (
                  <button
                    key={i}
                    disabled={!sl.available}
                    onClick={() => { setSelectedSlot(sl); setStep('comment'); }}
                    className={`px-2 h-10 text-sm font-semibold transition-colors ${
                      sl.available ? 'surface-chip hover:border-amber cursor-pointer' : 'bg-ink-300 opacity-30 cursor-not-allowed'
                    }`}
                    style={{ borderRadius: 8 }}
                    data-testid={`slot-${sl.time}`}
                  >
                    {sl.time}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setStep('service')} className="btn-ghost w-full mt-3" data-testid="slot-back">
              <ArrowLeft size={14} /> Назад
            </button>
          </div>
        )}

        {step === 'comment' && (
          <div className="space-y-3" data-testid="step-comment">
            <label className="slash-label">КОММЕНТАРИЙ (НЕОБЯЗАТЕЛЬНО)</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              placeholder="Опишите проблему или особые пожелания…"
              className="input-dark !h-auto !py-3"
              style={{ resize: 'vertical' }}
              data-testid="comment-input"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setStep('slot')} className="btn-secondary flex-1" data-testid="comment-back">
                <ArrowLeft size={14} /> Назад
              </button>
              <button onClick={() => setStep('confirm')} className="btn-primary flex-1" data-testid="comment-next">
                Далее <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3" data-testid="step-confirm">
            <div className="card !p-4 space-y-2">
              <Row label="Услуга" value={selectedService} />
              <Row label="Дата" value={selectedDate} />
              <Row label="Время" value={selectedSlot?.time || '—'} />
              {comment && <Row label="Комментарий" value={comment} />}
              <div className="hairline-t pt-2 flex justify-between">
                <span className="text-xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>Итого</span>
                <span className="font-display tracking-bebas text-xl text-amber">{provider.priceFrom ?? 500} ₴</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('comment')} className="btn-secondary flex-1" data-testid="confirm-back">
                <ArrowLeft size={14} /> Назад
              </button>
              <button onClick={submitBooking} className="btn-primary flex-1" data-testid="confirm-submit">
                <Zap size={14} fill="currentColor" /> Подтвердить
              </button>
            </div>
          </div>
        )}

        {step === 'creating' && (
          <div className="py-10 text-center">
            <div className="w-12 h-12 border-2 border-amber border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm" style={{ color: '#B8B8B8' }}>Создаём бронь…</p>
          </div>
        )}

        {step === 'success' && booking && (
          <div className="py-6 text-center" data-testid="step-success">
            <div className="icon-badge-soft !w-16 !h-16 mx-auto mb-4">
              <CheckCircle2 size={28} className="text-amber" />
            </div>
            <h4 className="font-display tracking-bebas text-2xl mb-2">БРОНЬ СОЗДАНА</h4>
            <p className="text-sm mb-6" style={{ color: '#B8B8B8' }}>Номер заявки: <span className="text-amber font-semibold">{booking.id}</span></p>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1">Закрыть</button>
              <button onClick={() => { onClose(); navigate(`/booking/${booking.id}`); }} className="btn-primary flex-1" data-testid="success-track">
                Отследить <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: '#8A8A8A' }} className="uppercase tracking-widest text-2xs">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}
