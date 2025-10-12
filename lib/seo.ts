import type { Metadata, MetadataRoute } from "next";

const DEFAULT_SITE_URL = "https://www.lernex.app";

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;

function resolveSiteUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

const siteUrl = resolveSiteUrl(rawSiteUrl);

const normalizedSiteUrl = siteUrl.origin + siteUrl.pathname.replace(/\/?$/, "");

export const siteConfig = {
  name: "Lernex",
  alternateName: "Lernex AI",
  tagline: "AI micro-lessons + instant quizzes",
  description:
    "Lernex delivers AI-powered micro-lessons, adaptive quizzes, and progress tracking so busy learners can master any topic fast.",
  url: normalizedSiteUrl,
  ogImage: "/api/og",
  locale: "en_US",
  keywords: [
    "AI learning platform",
    "micro lessons",
    "adaptive studying",
    "instant quizzes",
    "spaced repetition app",
    "lernex",
    "active recall practice",
  ],
};

function toAbsoluteUrl(path?: string | URL | null): string {
  if (!path) {
    return normalizedSiteUrl;
  }

  if (path instanceof URL) {
    return path.toString();
  }

  try {
    const maybeUrl = new URL(path);
    return maybeUrl.toString();
  } catch {
    return new URL(path.replace(/^\//, ""), `${normalizedSiteUrl}/`).toString();
  }
}

type NormalizedOgImage =
  | string
  | {
      url: string;
      alt?: string;
      width?: number;
      height?: number;
      type?: string;
    };

function normalizeOgImages(
  images?: Metadata["openGraph"] extends undefined
    ? undefined
    : Metadata["openGraph"] extends infer T
      ? T extends { images?: infer U }
        ? U
        : undefined
      : undefined,
  fallback?: string
): NormalizedOgImage[] | undefined {
  if (!images || (Array.isArray(images) && images.length === 0)) {
    if (!fallback) return undefined;
    return [{ url: toAbsoluteUrl(fallback) }];
  }

  const list = Array.isArray(images) ? images : [images];

  return list.map((entry): NormalizedOgImage => {
    if (typeof entry === "string" || entry instanceof URL) {
      return toAbsoluteUrl(entry);
    }

    if (entry && typeof entry === "object") {
      const record = entry as {
        url?: string | URL | null;
        alt?: unknown;
        width?: unknown;
        height?: unknown;
        type?: unknown;
      };
      const normalizedUrl = record.url
        ? toAbsoluteUrl(record.url)
        : fallback
          ? toAbsoluteUrl(fallback)
          : normalizedSiteUrl;

      const alt =
        typeof record.alt === "string"
          ? record.alt
          : record.alt != null
            ? String(record.alt)
            : undefined;

      const width = typeof record.width === "number" ? record.width : undefined;
      const height = typeof record.height === "number" ? record.height : undefined;
      const type = typeof record.type === "string" ? record.type : undefined;

      return {
        url: normalizedUrl,
        ...(alt ? { alt } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(type ? { type } : {}),
      };
    }

    return fallback ? { url: toAbsoluteUrl(fallback) } : toAbsoluteUrl("");
  });
}

const defaultOgImage = toAbsoluteUrl(siteConfig.ogImage);

export const defaultMetadata: Metadata = {
  metadataBase: new URL(`${normalizedSiteUrl}/`),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    type: "website",
    url: siteConfig.url,
    title: siteConfig.name,
    siteName: siteConfig.name,
    description: siteConfig.description,
    locale: siteConfig.locale,
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: "Lernex platform preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [defaultOgImage],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

type BuildMetadataOptions = {
  title?: string;
  description?: string;
  path?: string;
  keywords?: string[];
  openGraph?: NonNullable<Metadata["openGraph"]>;
  twitter?: NonNullable<Metadata["twitter"]>;
  noindex?: boolean;
};

export function buildMetadata(options: BuildMetadataOptions = {}): Metadata {
  const {
    title,
    description,
    path,
    keywords,
    openGraph,
    twitter,
    noindex = false,
  } = options;

  const resolvedDescription = description ?? siteConfig.description;
  const canonical = path ? toAbsoluteUrl(path) : siteConfig.url;
  const resolvedKeywords = keywords ?? siteConfig.keywords;
  const normalizedImages = normalizeOgImages(openGraph?.images, siteConfig.ogImage);
  const resolvedOgImage =
    normalizedImages && normalizedImages.length > 0
      ? typeof normalizedImages[0] === "string"
        ? normalizedImages[0]
        : normalizedImages[0].url
      : defaultOgImage;

  const ogImages = normalizedImages ?? [
    {
      url: defaultOgImage,
      width: 1200,
      height: 630,
      alt: String(openGraph?.title ?? `${siteConfig.name} cover image`),
    },
  ];

  const mergedOpenGraph: NonNullable<Metadata["openGraph"]> = {
    ...defaultMetadata.openGraph,
    ...openGraph,
    title: openGraph?.title ?? (title ? `${title} | ${siteConfig.name}` : defaultMetadata.openGraph?.title ?? siteConfig.name),
    description: openGraph?.description ?? resolvedDescription,
    url: canonical,
    images: ogImages as NonNullable<Metadata["openGraph"]>["images"],
  };

  const baseTwitter = defaultMetadata.twitter;
  const twitterImagesSource = twitter?.images ?? (typeof baseTwitter === "object" ? baseTwitter?.images : undefined);
  const twitterImages = (() => {
    if (!twitterImagesSource) return [resolvedOgImage];
    if (Array.isArray(twitterImagesSource)) {
      return twitterImagesSource.map((value) =>
        value instanceof URL ? value.toString() : String(value)
      );
    }
    return [twitterImagesSource instanceof URL ? twitterImagesSource.toString() : String(twitterImagesSource)];
  })();

  const mergedTwitter: NonNullable<Metadata["twitter"]> = {
    ...(typeof baseTwitter === "object" ? baseTwitter : { card: "summary_large_image" }),
    ...twitter,
    title: twitter?.title ?? (title ? `${title} | ${siteConfig.name}` : siteConfig.name),
    description: twitter?.description ?? resolvedDescription,
    images: twitterImages,
  };

  return {
    title,
    description: resolvedDescription,
    keywords: resolvedKeywords,
    alternates: { canonical },
    openGraph: mergedOpenGraph,
    twitter: mergedTwitter,
    robots: noindex
      ? {
          index: false,
          follow: false,
        }
      : defaultMetadata.robots,
  };
}

export function absoluteUrl(path = ""): string {
  return toAbsoluteUrl(path);
}

export const sitemapEntries: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/docs", changeFrequency: "monthly", priority: 0.6 },
  { path: "/playlists", changeFrequency: "weekly", priority: 0.7 },
  { path: "/fyp", changeFrequency: "daily", priority: 0.9 },
  { path: "/leaderboard", changeFrequency: "weekly", priority: 0.6 },
  { path: "/login", changeFrequency: "yearly", priority: 0.4 },
  { path: "/support", changeFrequency: "monthly", priority: 0.4 },
];

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.name,
  alternateName: siteConfig.alternateName,
  url: siteConfig.url,
  slogan: siteConfig.tagline,
  logo: toAbsoluteUrl("/favicon.ico"),
};

export const productSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  alternateName: siteConfig.alternateName,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0.00",
    priceCurrency: "USD",
  },
  description: siteConfig.description,
  url: siteConfig.url,
};

export const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Lernex?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Lernex is an AI learning coach that turns any subject into bite-sized micro-lessons and instant quizzes so you can learn faster with less friction.",
      },
    },
    {
      "@type": "Question",
      name: "How does Lernex personalize my study plan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Lernex adapts to your performance in real time by adjusting lesson difficulty, review cadence, and quiz feedback based on spaced repetition research.",
      },
    },
    {
      "@type": "Question",
      name: "Can I use Lernex for teams or classrooms?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Lernex lets you collaborate on shared playlists, monitor learner progress, and keep everyone aligned with lightweight analytics.",
      },
    },
  ],
};
