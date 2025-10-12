import Script from "next/script";
import { faqSchema, organizationSchema, productSchema } from "@/lib/seo";

const schemas = [
  { id: "lernex-org-schema", data: organizationSchema },
  { id: "lernex-product-schema", data: productSchema },
  { id: "lernex-faq-schema", data: faqSchema },
];

export default function StructuredData() {
  return (
    <>
      {schemas.map((schema) => (
        <Script
          key={schema.id}
          id={schema.id}
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema.data) }}
        />
      ))}
    </>
  );
}
