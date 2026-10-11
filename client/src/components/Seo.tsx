import React from "react";
import { Helmet } from "react-helmet-async";
import { seoTagList, type JsonLd } from "@shared/seo";

interface SeoProps {
  /** Canonical route path, e.g. "/" or "/faq". */
  path: string;
  /** Extra JSON-LD nodes (FAQPage, BreadcrumbList, ...) for this page. */
  jsonLd?: JsonLd[];
}

/**
 * Renders the crawler-facing head tags for a route.
 *
 * The tag list comes from `shared/seo.ts`, the same source the build-time
 * prerenderer uses, so the client-rendered head and the static HTML can
 * never drift apart.
 */
export function Seo({ path, jsonLd = [] }: SeoProps): React.ReactElement {
  return (
    <Helmet>
      {seoTagList(path, jsonLd).map((tag, i) => {
        const key = `${tag.tag}-${i}`;
        if (tag.tag === "title") {
          return <title key={key}>{tag.content ?? ""}</title>;
        }
        if (tag.tag === "script") {
          return (
            <script key={key} {...tag.attrs}>
              {tag.content ?? ""}
            </script>
          );
        }
        if (tag.tag === "link") {
          return <link key={key} {...tag.attrs} />;
        }
        return <meta key={key} {...tag.attrs} />;
      })}
    </Helmet>
  );
}

export default Seo;
