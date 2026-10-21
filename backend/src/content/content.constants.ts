// Template options
export const BLOG_CATEGORIES = ['Guides', 'Buying Guide', 'Technology', 'Energy Savings', 'Applications', 'News'] as const;

export const CASE_STUDY_INDUSTRIES = [
  'Warehouse',
  'Factory',
  'Workshop',
  'Outdoor',
  'Commercial',
  'Institution',
  'Agriculture',
  'Sports & Events',
  'Other',
] as const;

// Needs custom name
export const OTHER_INDUSTRY = 'Other';

// Default blog byline
export const DEFAULT_BLOG_BYLINE = 'Spyro Fans Team';

// List sort options
export const CONTENT_POST_SORTS = ['updated_desc', 'published_desc', 'published_asc', 'title_asc', 'title_desc'] as const;
export type ContentPostSort = (typeof CONTENT_POST_SORTS)[number];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 80;

export const TITLE_MAX_LENGTH = 120;
export const SEO_TITLE_MAX_LENGTH = 70;
export const SEO_DESCRIPTION_MAX_LENGTH = 160;
export const EXCERPT_MAX_LENGTH = 280;
export const IMAGE_ALT_MAX_LENGTH = 150;

export const BLOG_TAGS_MAX = 10;
export const BLOG_TAG_MAX_LENGTH = 30;
export const BLOG_BYLINE_MAX_LENGTH = 80;

export const CASE_STUDY_TEXT_MAX_LENGTH = 2000;
export const CASE_STUDY_KEY_RESULTS_MAX = 4;
export const CASE_STUDY_GALLERY_MAX = 12;
export const CASE_STUDY_PRODUCTS_MAX = 20;
export const CASE_STUDY_PRODUCT_QUANTITY_MAX = 10000;
export const CASE_STUDY_AREA_SQFT_MAX = 10_000_000;

// Allowed video hosts
export const VIDEO_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

// Upload size limit
export const CONTENT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

// Article limits
export const RICH_TEXT_MAX_BYTES = 200 * 1024;
export const RICH_TEXT_MAX_DEPTH = 12;

// India time
export const CONTENT_TIME_ZONE_OFFSET = '+05:30';

export const WORDS_PER_MINUTE = 200;
