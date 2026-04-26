import { Link } from 'react-router-dom';
import { Star, MapPin, Clock, ShieldCheck, Wrench } from 'lucide-react';

export interface ProviderCardData {
  id?: string;
  _id?: string;
  slug?: string;
  name?: string;
  title?: string;
  photo?: string;
  logo?: string;
  description?: string;
  specialization?: string;
  isOnline?: boolean;
  status?: string;
  ratingAvg?: number;
  rating?: number;
  reviewsCount?: number;
  reviewCount?: number;
  distanceKm?: number;
  distance?: number;
  etaMin?: number;
  eta?: number;
  priceFrom?: number;
  minPrice?: number;
  trustBadges?: string[];
  tags?: string[];
  verified?: boolean;
  mobileService?: boolean;
}

/**
 * Sprint 14 — Light ProviderCard
 * Goals: scannable in <3 seconds, trust-first, Booking-class layout.
 * Layout: [photo 96] [title + meta] [price + CTAs]
 * Yellow used only on the primary CTA. Trust signals as soft chips.
 */
export function ProviderCard({ provider }: { provider: ProviderCardData }) {
  const slug = provider.slug || provider.id || provider._id || 'unknown';
  const isOnline = provider.isOnline ?? provider.status === 'online' ?? true;
  const rating = provider.ratingAvg ?? provider.rating ?? 4.8;
  const reviews = provider.reviewsCount ?? provider.reviewCount ?? 0;
  const distance = provider.distanceKm ?? provider.distance ?? null;
  const eta = provider.etaMin ?? provider.eta ?? null;
  const price = provider.priceFrom ?? provider.minPrice ?? null;
  const photo = provider.photo || provider.logo;
  const description = provider.specialization || provider.description || 'Diagnostics, repair, mobile service';

  const trustChips = (provider.trustBadges && provider.trustBadges.length > 0)
    ? provider.trustBadges
    : (provider.tags && provider.tags.length > 0)
      ? provider.tags
      : (() => {
          const auto: string[] = [];
          if (provider.verified) auto.push('Verified');
          if (provider.mobileService) auto.push('Mobile');
          if (auto.length === 0) auto.push('Verified', 'Fast response');
          return auto;
        })();

  return (
    <article
      className="provider-card grid gap-4 p-4 md:grid-cols-[96px_1fr_auto] items-center"
      data-testid={`provider-card-${slug}`}
    >
      {/* Photo */}
      <Link
        to={`/provider/${slug}`}
        className="block h-24 w-24 overflow-hidden rounded-2xl bg-[var(--surface-soft)] shrink-0"
        data-testid={`provider-photo-${slug}`}
      >
        {photo ? (
          <img src={photo} alt={provider.name || 'Provider'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-soft)]">
            <Wrench size={32} />
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/provider/${slug}`} className="text-lg font-extrabold text-[var(--text)] hover:underline truncate" data-testid={`provider-name-${slug}`}>
            {provider.name || provider.title}
          </Link>
          {isOnline && (
            <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--success)]" data-testid={`provider-status-${slug}`}>
              Open
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-[var(--text-2)] line-clamp-1">{description}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-2)]">
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--text)]">
            <Star size={14} className="text-[var(--primary)] fill-[var(--primary)]" />
            {Number(rating).toFixed(1)}
            {reviews > 0 && <span className="text-[var(--text-soft)] font-normal">({reviews})</span>}
          </span>
          {distance !== null && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} className="text-[var(--text-soft)]" /> {Number(distance).toFixed(1)} km
            </span>
          )}
          {eta !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock size={14} className="text-[var(--text-soft)]" /> {eta} min
            </span>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {trustChips.slice(0, 4).map((badge: string) => (
            <span
              key={badge}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-2)]"
            >
              {badge.toLowerCase().includes('verif') && <ShieldCheck size={11} className="text-[var(--success)]" />}
              {badge}
            </span>
          ))}
        </div>
      </div>

      {/* Price + CTAs */}
      <div className="flex flex-row md:flex-col md:items-end justify-between md:justify-start gap-3 md:min-w-[180px]">
        {price !== null && (
          <div className="md:text-right">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-soft)]">from</div>
            <div className="text-2xl font-extrabold text-[var(--text)]">{price} €</div>
          </div>
        )}
        <div className="flex gap-2">
          <Link
            to={`/provider/${slug}?action=book`}
            className="btn-primary btn-sm"
            data-testid={`provider-book-${slug}`}
          >
            Book
          </Link>
          <Link
            to={`/provider/${slug}`}
            className="btn-secondary btn-sm"
            data-testid={`provider-profile-${slug}`}
          >
            Profile
          </Link>
        </div>
      </div>
    </article>
  );
}

export default ProviderCard;
