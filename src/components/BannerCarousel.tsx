import { useEffect, useRef, useState } from 'react';
import type { Banner } from '../types';

interface BannerCarouselProps {
  banners: Banner[];
  onSelect: (linkCategoryId: string | null) => void;
}

const AUTO_ADVANCE_MS = 4500;

export function BannerCarousel({ banners, onSelect }: BannerCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActiveIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  // Re-armed on every activeIndex change, so a manual swipe pushes the next
  // auto-advance out by a full interval instead of fighting the user's scroll.
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => {
      const track = trackRef.current;
      if (!track || track.clientWidth === 0) return;
      const nextIndex = (activeIndex + 1) % banners.length;
      track.scrollTo({ left: nextIndex * track.clientWidth, behavior: 'smooth' });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [activeIndex, banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="home-banner">
      <div className="home-banner__track" ref={trackRef} onScroll={handleScroll}>
        {banners.map((banner) => (
          <button
            key={banner.id}
            type="button"
            className="home-banner__slide"
            onClick={() => onSelect(banner.linkCategoryId)}
          >
            <img src={banner.imageUrl} alt={banner.title} />
            {(banner.title || banner.subtitle) && (
              <span className="home-banner__caption">
                {banner.title && <strong>{banner.title}</strong>}
                {banner.subtitle && <span>{banner.subtitle}</span>}
              </span>
            )}
          </button>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="home-banner__dots">
          {banners.map((banner, index) => (
            <span key={banner.id} className={`home-banner__dot ${index === activeIndex ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}
