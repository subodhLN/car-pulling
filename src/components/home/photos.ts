import type { StaticImageData } from 'next/image';
import agra from '../../../public/images/cities/agra.jpg';
import amritsar from '../../../public/images/cities/amritsar.jpg';
import jaipur from '../../../public/images/cities/jaipur.jpg';
import shimla from '../../../public/images/cities/shimla.jpg';
import hero from '../../../public/images/hero.jpg';
import trust from '../../../public/images/trust.jpg';

export type Photo = { src: StaticImageData; alt: string; /** CSS object-position for the crop. */ position?: string };

export const HERO_PHOTO: Photo = {
  src: hero,
  alt: 'A driver’s hands on the steering wheel, heading into the city at dusk',
  position: '60% 40%',
};

export const TRUST_PHOTO: Photo = {
  src: trust,
  alt: 'A group of friends sitting arm in arm, looking out across the water',
};

const CITY_PHOTOS: Record<string, Photo> = {
  jaipur: { src: jaipur, alt: 'Amer Fort above Jaipur' },
  agra: { src: agra, alt: 'Taj Mahal framed by a carved archway' },
  amritsar: { src: amritsar, alt: 'Golden Temple in Amritsar at sunset' },
  shimla: { src: shimla, alt: 'Shimla’s hillside houses under a blue sky' },
};

/** Destinations without their own photo get a portrait crop of the hero (hand on the wheel, city lights). */
const FALLBACK: Photo = { ...HERO_PHOTO, position: '47% 50%' };

export function cityPhoto(slug: string | null): Photo {
  return (slug && CITY_PHOTOS[slug]) || FALLBACK;
}
