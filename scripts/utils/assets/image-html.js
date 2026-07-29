function escape(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function imageTag(asset, options = {}) {
  if (!asset?.src) return "";
  const decorative = options.decorative ?? asset.decorative ?? false;
  const attributes = [
    `src="${escape(asset.src)}"`, `alt="${decorative ? "" : escape(options.alt || asset.alt || "")}"`,
    `width="${Number(asset.width || 800)}"`, `height="${Number(asset.height || 600)}"`,
    `loading="${options.loading || "lazy"}"`, `decoding="${options.decoding || "async"}"`,
  ];
  if (options.fetchpriority) attributes.push(`fetchpriority="${escape(options.fetchpriority)}"`);
  if (options.className) attributes.push(`class="${escape(options.className)}"`);
  if (decorative) attributes.push('aria-hidden="true"', 'role="presentation"');
  return `<img ${attributes.join(" ")}>`;
}

function placeholder(asset, options = {}) {
  const label = options.alt || asset?.alt || "이미지 준비 중";
  return `<div class="image-placeholder" role="img" aria-label="${escape(label)} 이미지가 들어갈 자리"><span>Image Placeholder</span></div>`;
}

function renderImageBox(asset, modifier, options = {}) {
  const content = asset?.src ? imageTag(asset, options) : placeholder(asset, options);
  return `<div class="image-box ${escape(modifier || "")}" data-asset-key="${escape(asset?.key || "fallback")}" data-asset-source="${escape(asset?.source || "css-fallback")}">${content}</div>`;
}

function renderPicture({ desktop, mobile, className = "", alt, loading = "eager", fetchpriority = "high" }) {
  if (!desktop?.src) return renderImageBox(desktop, className, { alt, loading, fetchpriority });
  const source = mobile?.src || desktop.src;
  const sourceType = /\.webp(?:$|\?)/i.test(source) ? ' type="image/webp"' : "";
  const sourceWidth = Number(mobile?.width || desktop.width || 800);
  const sourceHeight = Number(mobile?.height || desktop.height || 600);
  return `<div class="image-box ${escape(className)}" data-asset-key="${escape(desktop.key || "hero")}" data-asset-source="${escape(desktop.source || "primary")}"><picture><source media="(max-width: 767px)" srcset="${escape(source)}"${sourceType} width="${sourceWidth}" height="${sourceHeight}">${imageTag(desktop, { alt, loading, decoding: "async", fetchpriority })}</picture></div>`;
}

function renderLogo(asset) {
  if (asset?.src) return imageTag(asset, { loading: "eager", decorative: true, className: "brand-logo-image" });
  return '<span class="brand-logo-fallback" aria-hidden="true">K</span>';
}

function renderOgTags(asset, baseUrl = "") {
  if (!asset?.src) return "";
  const cleanBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  const source = /^https?:\/\//i.test(asset.src)
    ? asset.src
    : `${cleanBaseUrl}${asset.src.startsWith("/") ? asset.src : `/${asset.src}`}`;
  return `<meta property="og:image" content="${escape(source)}">\n  <meta property="og:image:width" content="${Number(asset.width || 1200)}">\n  <meta property="og:image:height" content="${Number(asset.height || 630)}">\n  <meta name="twitter:image" content="${escape(source)}">`;
}

module.exports = { escape, imageTag, placeholder, renderImageBox, renderLogo, renderOgTags, renderPicture };
