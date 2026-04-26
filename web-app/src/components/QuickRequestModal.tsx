import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Zap, Star, MapPin, Clock, ShieldCheck, ChevronRight, ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../services/api';

/**
 * Sprint 14.5 — Quick Request Modal (Problem → Solution)
 * Single text field, no taxonomy. Backend (POST /api/quick-request/resolve)
 * classifies the text and returns ranked solutions.
 *
 * 3 states: input → matching → result.
 */

type QuickStep = 'input' | 'matching' | 'result' | 'error';

interface Solution {
  providerId: string;
  slug: string;
  name: string;
  rating: number;
  reviewsCount: number;
  eta: number;
  etaText: string;
  distance: number;
  distanceText: string;
  priceFrom: number;
  isOnline: boolean;
  matchScore: number;
  badges?: string[];
  warranty?: string;
  vatIncluded?: boolean;
}

interface ResolveResponse {
  problemType:     string;
  problemLabel:    string;
  matchedCount:    number;
  solutions:       Solution[];
  recommended:     string | null;
  recommendedSlug: string | null;
  echoText:        string;
}

const SUGGESTIONS = [
  "Car won't start",
  'Engine noise',
  'Brake problem',
  'Battery dead',
  'Need tow truck',
  'Diagnostics',
];

export default function QuickRequestModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<QuickStep>('input');
  const [text, setText] = useState('');
  const [data, setData] = useState<ResolveResponse | null>(null);
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setText('');
      setData(null);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!text.trim()) return;
    setStep('matching');
    setError('');
    try {
      const location = await getLocationOrFallback();
      const res = await api.post<ResolveResponse>('/quick-request/resolve', { text: text.trim(), location });
      if (!res.data?.solutions?.length) {
        setError('No mechanics available right now. Please try again in a few minutes.');
        setStep('error');
        return;
      }
      setData(res.data);
      setStep('result');
    } catch (e: any) {
      setError(e?.message || 'Could not reach the matching service.');
      setStep('error');
    }
  };

  const handleBook = (slug: string) => {
    onClose();
    navigate(`/provider/${slug}?action=book`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center modal-backdrop p-0 md:p-4" onClick={onClose} data-testid="qr-modal">
      <div
        className="modal-content relative w-full md:max-w-lg p-6 max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="qr-modal-content"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 h-9 w-9 rounded-xl border border-[var(--border)] bg-white hover:bg-[var(--surface-soft)] flex items-center justify-center"
          aria-label="Close"
          data-testid="qr-close"
        >
          <X size={16} />
        </button>

        {step === 'input' && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-h)]">⚡ Quick request</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-2" data-testid="qr-title">
              What happened?
            </h2>
            <p className="text-sm text-[var(--text-2)] mb-5">Describe your problem in one sentence — we'll find the best mechanic.</p>

            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Car won't start, engine noise…"
              className="input-light input-lg"
              data-testid="qr-input"
              maxLength={140}
            />

            <div className="mt-3 flex flex-wrap gap-1.5" data-testid="qr-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setText(s)}
                  className="chip text-xs"
                  data-testid={`qr-suggest-${s.split(' ')[0].toLowerCase()}`}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={submit}
              disabled={!text.trim()}
              className="btn-primary btn-lg w-full mt-5 disabled:opacity-50"
              data-testid="qr-submit"
            >
              <Zap size={18} /> Find solution
            </button>
            <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-[var(--text-soft)]">
              <span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> Verified workshops</span>
              <span>·</span>
              <span>VAT included · Invoice ready</span>
            </div>
          </>
        )}

        {step === 'matching' && (
          <div className="py-10 text-center" data-testid="qr-matching">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)] mb-5">
              <Loader2 size={28} className="text-[var(--primary-p)] animate-spin" />
            </div>
            <h3 className="text-xl font-extrabold mb-1">Finding the best match…</h3>
            <p className="text-sm text-[var(--text-2)]">Scanning mechanics in your area</p>
            <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="h-full bg-[var(--primary)] animate-pulse" style={{ width: '70%' }} />
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="py-8 text-center" data-testid="qr-error">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--danger-soft)] mb-4">
              <AlertTriangle size={26} className="text-[var(--danger)]" />
            </div>
            <h3 className="text-lg font-extrabold mb-1">Something went wrong</h3>
            <p className="text-sm text-[var(--text-2)] mb-5">{error}</p>
            <button onClick={() => setStep('input')} className="btn-secondary w-full" data-testid="qr-retry">
              <ArrowLeft size={14} /> Try again
            </button>
          </div>
        )}

        {step === 'result' && data && (
          <div data-testid="qr-result">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-h)]">⚡ {data.problemLabel}</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight mb-1">Best match</h2>
            <p className="text-sm text-[var(--text-2)] mb-5">
              {data.matchedCount} mechanic{data.matchedCount === 1 ? '' : 's'} ready to help
            </p>

            {/* Best */}
            <BestMatchCard solution={data.solutions[0]} onBook={() => handleBook(data.recommendedSlug || data.solutions[0].slug)} />

            {/* Alternatives */}
            {data.solutions.length > 1 && (
              <>
                <div className="mt-5 mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-soft)]">
                  Alternatives
                </div>
                <div className="space-y-2" data-testid="qr-alternatives">
                  {data.solutions.slice(1, 4).map((s) => (
                    <AltCard key={s.providerId} s={s} onBook={() => handleBook(s.slug)} />
                  ))}
                </div>
              </>
            )}

            <button onClick={() => setStep('input')} className="btn-ghost w-full mt-4" data-testid="qr-back">
              <ArrowLeft size={14} /> Refine your problem
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── helpers ──────────────────────────────────────────────── */

async function getLocationOrFallback(): Promise<{ lat: number; lng: number }> {
  if (!navigator.geolocation) return { lat: 52.520008, lng: 13.404954 }; // Berlin
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ lat: 52.520008, lng: 13.404954 }), 1500);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(t); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      ()    => { clearTimeout(t); resolve({ lat: 52.520008, lng: 13.404954 }); },
      { timeout: 1500, maximumAge: 60_000 }
    );
  });
}

function BestMatchCard({ solution, onBook }: { solution: Solution; onBook: () => void }) {
  const matchPercent = Math.round(solution.matchScore * 100);
  return (
    <div className="rounded-2xl border-2 border-[var(--primary)] bg-white p-5 shadow-[var(--shadow-card)]" data-testid="qr-best">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="badge badge-solid">{matchPercent}% match</span>
            {solution.isOnline && <span className="badge badge-success">Open</span>}
          </div>
          <div className="text-xl font-extrabold mt-1">{solution.name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-2)]">
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--text)]">
              <Star size={14} className="text-[var(--primary)] fill-[var(--primary)]" />
              {solution.rating}
              {solution.reviewsCount > 0 && <span className="text-[var(--text-soft)] font-normal">({solution.reviewsCount})</span>}
            </span>
            <span className="inline-flex items-center gap-1"><MapPin size={14} className="text-[var(--text-soft)]" /> {solution.distanceText}</span>
            <span className="inline-flex items-center gap-1"><Clock size={14} className="text-[var(--text-soft)]" /> {solution.etaText}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-soft)]">from</div>
          <div className="text-2xl font-extrabold">{solution.priceFrom} €</div>
          <div className="text-[10px] text-[var(--text-soft)]">VAT incl. · {solution.warranty}</div>
        </div>
        <button onClick={onBook} className="btn-primary btn-lg" data-testid="qr-best-book">
          Book now <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function AltCard({ s, onBook }: { s: Solution; onBook: () => void }) {
  return (
    <button
      onClick={onBook}
      className="w-full text-left rounded-xl border border-[var(--border)] bg-white p-3 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-card)] transition flex items-center gap-3"
      data-testid={`qr-alt-${s.slug}`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-bold truncate">{s.name}</div>
        <div className="text-xs text-[var(--text-2)] flex items-center gap-2 mt-0.5">
          <span className="inline-flex items-center gap-1"><Star size={11} className="text-[var(--primary)] fill-[var(--primary)]" /> {s.rating}</span>
          <span>·</span>
          <span>{s.distanceText}</span>
          <span>·</span>
          <span>{s.etaText}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-extrabold">{s.priceFrom} €</div>
        <div className="text-[10px] text-[var(--text-soft)]">from</div>
      </div>
      <ChevronRight size={16} className="text-[var(--text-soft)] shrink-0" />
    </button>
  );
}
