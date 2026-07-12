
import JSZip from 'jszip';
import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import markedFootnote from 'marked-footnote';
import { Chapter } from '../types';

// Initialize Markdown converters
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Custom Rule: Convert EPUB3 footnote links to Markdown footnotes
turndownService.addRule('epub-noteref', {
  filter: function(node) {
    return node.nodeName === 'A' && (node.getAttribute('epub:type') === 'noteref' || node.classList.contains('noteref'));
  },
  replacement: function(content, node) {
    const href = node.getAttribute('href');
    if (href && href.startsWith('#')) {
      const id = href.substring(1);
      return `[^${id}]`;
    }
    return content;
  }
});

// Custom Rule: Convert EPUB3 footnote definitions to Markdown footnotes
turndownService.addRule('epub-footnote-def', {
  filter: function(node) {
    return node.getAttribute('epub:type') === 'footnote' || node.classList.contains('footnote') || node.classList.contains('footnote-def');
  },
  replacement: function(content, node) {
    const id = node.getAttribute('id');
    if (id) {
      // Clean up internal breaks to keep the definition block together
      const cleanContent = content.trim().replace(/\n+/g, ' ');
      return `\n\n[^${id}]: ${cleanContent}\n\n`;
    }
    return content;
  }
});

// Custom Rule: Flatten Headings
turndownService.addRule('flattenHeader', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: function (content, node, options) {
    const hLevel = Number(node.nodeName.charAt(1));
    const hashes = '#'.repeat(hLevel);
    const cleanContent = content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return `\n\n${hashes} ${cleanContent}\n\n`;
  }
});

// Register LaTeX Math Extension for Marked
const mathExtension = {
  extensions: [
    {
      name: 'blockMath',
      level: 'block',
      start(src: string) { return src.indexOf('$$'); },
      tokenizer(src: string) {
        const rule = /^\$\$([\s\S]*?)\$\$/;
        const match = rule.exec(src);
        if (match) {
          return {
            type: 'blockMath',
            raw: match[0],
            text: match[1].trim()
          };
        }
      },
      renderer(token: any) {
        try {
          return katex.renderToString(token.text, {
            displayMode: true,
            output: 'mathml',
            throwOnError: false
          });
        } catch (e) {
          console.warn('KaTeX block render error:', e);
          return token.raw;
        }
      }
    },
    {
      name: 'inlineMath',
      level: 'inline',
      start(src: string) { return src.indexOf('$'); },
      tokenizer(src: string) {
        const rule = /^\$([^$\n]+)\$/;
        const match = rule.exec(src);
        if (match) {
          return {
            type: 'inlineMath',
            raw: match[0],
            text: match[1].trim()
          };
        }
      },
      renderer(token: any) {
        try {
          return katex.renderToString(token.text, {
            displayMode: false,
            output: 'mathml',
            throwOnError: false
          });
        } catch (e) {
          // If parsing fails (e.g., $100 which isn't valid math), fallback to text
          return token.raw;
        }
      }
    }
  ]
};

marked.use(mathExtension as any);
marked.use(markedFootnote({ 
  prefixId: 'fn-',
  refMarkers: true 
}) as any);

// Helper to escape XML
const escapeXml = (unsafe: any): string => {
  if (unsafe === null || unsafe === undefined) return '';
  const str = String(unsafe);
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

const CHINESE_EPUB_CSS = `
  @charset "UTF-8";
  
  /* Basic typography: Prioritize Songti/XIAOBIAOSONG, optimize alignment */
  body {
    font-family: "ZY-XIAOBIAOSONG", "Songti SC", "SimSun", "STSong", "Times New Roman", serif;
    font-size: 1em;
    line-height: 1.8em;
    text-align: justify;
    text-justify: inter-ideograph;
    word-break: break-all;
    padding: 0 3%;
    color: #333;
    margin: 0;
  }

  /* Headings: Teal #2e5b60, non-bold */
  h1, h2, h3, h4, h5, h6 {
    font-family: "fzqys", "ZY-XIAOBIAOSONG", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-weight: normal;
    color: #2e5b60;
    text-align: center;
    margin-top: 1em;
    margin-bottom: 2.2em;
    line-height: 1.6;
  }

  h1 { 
    font-size: 1.3em; 
    border-bottom: 1px dotted #A2906A;
    padding-bottom: 0.6em; 
  }
  
  h2 { font-size: 1.15em; }
  h3 { font-size: 1.1em; }

  /* Paragraphs: Standard indent */
  p {
    text-indent: 2em;
    margin: 0.5em 0;
    line-height: 1.8em;
    text-align: justify;
    text-justify: inter-ideograph;
  }

  /* Blockquote: FangSong/Serif, dark brown (#412938) */
  blockquote {
    font-family: "fs2", "ZY-FANGSONG", "FangSong", "KaiTi", serif;
    font-size: 1em;
    margin: 1.8em 1em;
    padding: 0;
    text-indent: 2em;
    color: #412938;
    border: none;
    background: none;
  }
  
  /* Horizontal Rule: Dotted, bronze (#A2906A) */
  hr {
    border: 0;
    border-top: 1px dotted #A2906A;
    margin: 2em auto;
    width: 60%;
    color: #A2906A;
    background-color: transparent;
    height: 1px;
  }
  
  /* Lists */
  ul, ol {
    margin: 1em 0 1em 2em;
    padding: 0;
  }
  
  li {
    margin-bottom: 0.3em;
  }

  /* Images */
  img {
    display: block;
    margin: 1.5em auto;
    max-width: 100%;
    height: auto;
    border-radius: 2px;
  }
  
  /* Code Blocks */
  pre, code {
    font-family: "Consolas", "Monaco", monospace;
    background-color: #f5f5f5;
    padding: 0.2em;
    border-radius: 3px;
    font-size: 0.9em;
    color: #d63384;
  }
  
  /* Links */
  a {
    color: #2e5b60;
    text-decoration: none;
    border-bottom: 1px dashed #2e5b60;
  }
`;

const DEFAULT_EPUB_CSS = `
  @charset "UTF-8";
  
  body {
    font-family: "Times New Roman", serif;
    line-height: 1.6;
    padding: 0 3%;
    color: #333;
    margin: 0;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: Helvetica, Arial, sans-serif;
    font-weight: bold;
    color: #1a1a1a;
    text-align: center;
    margin-top: 1.5em;
    margin-bottom: 1em;
  }
  
  h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5em; }

  p {
    text-indent: 0;
    margin-bottom: 1.2em;
    margin-top: 0;
  }

  blockquote {
    border: none;
    margin: 1em 2em;
    padding: 0;
    color: inherit;
    font-style: italic;
  }

  img {
    display: block;
    margin: 1.5em auto;
    max-width: 100%;
    height: auto;
  }

  code, pre {
    font-family: monospace;
    background: #f4f4f4;
    padding: 0.2em;
  }
`;

export class EpubService {
  async parseEpub(file: File): Promise<{ 
    chapters: Chapter[], 
    images: Record<string, Blob>, 
    coverPath?: string,
    opfPath: string,
    opfDir: string,
    cssFiles: string[]
  }> {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(file);

    const containerFile = loadedZip.file("META-INF/container.xml");
    if (!containerFile) throw new Error("Invalid EPUB: Missing META-INF/container.xml");
    
    const containerXml = await containerFile.async("string");
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "application/xml");
    const rootfileNode = containerDoc.querySelector("rootfile");
    
    if (!rootfileNode) throw new Error("Invalid EPUB: Missing rootfile in container.xml");
    const opfPath = rootfileNode.getAttribute("full-path");
    if (!opfPath) throw new Error("Invalid EPUB: rootfile missing full-path");

    const opfFile = loadedZip.file(opfPath);
    if (!opfFile) throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
    
    const opfXml = await opfFile.async("string");
    const opfDoc = parser.parseFromString(opfXml, "application/xml");
    
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

    const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item")).reduce((acc, item) => {
      acc[item.getAttribute("id")!] = item.getAttribute("href")!;
      return acc;
    }, {} as Record<string, string>);

    // Get list of CSS files
    const cssFiles = Array.from(opfDoc.querySelectorAll("manifest > item[media-type='text/css']"))
      .map(item => opfDir + item.getAttribute("href")!);

    // Find Navigation File (NCX or NAV)
    let tocMap: Record<string, string> = {};
    const spine = opfDoc.querySelector("spine");
    const tocId = spine?.getAttribute("toc");

    // Try NCX (EPUB 2/3)
    if (tocId && manifestItems[tocId]) {
      const ncxFile = loadedZip.file(opfDir + manifestItems[tocId]);
      if (ncxFile) {
        const ncxXml = await ncxFile.async("string");
        const ncxDoc = parser.parseFromString(ncxXml, "application/xml");
        const navPoints = ncxDoc.querySelectorAll("navPoint");
        navPoints.forEach(point => {
          const label = point.querySelector("navLabel > text")?.textContent?.trim();
          const src = point.querySelector("content")?.getAttribute("src");
          if (label && src) {
            // Remove anchors for mapping to file
            const href = src.split('#')[0];
            if (!tocMap[href]) tocMap[href] = label;
          }
        });
      }
    }

    // Try NAV (EPUB 3) if NCX failed or as secondary source
    const navItem = opfDoc.querySelector('manifest > item[properties~="nav"]');
    if (navItem) {
      const navHref = navItem.getAttribute("href");
      if (navHref) {
        const navFile = loadedZip.file(opfDir + navHref);
        if (navFile) {
          const navHtml = await navFile.async("string");
          const navDoc = parser.parseFromString(navHtml, "text/html");
          const links = navDoc.querySelectorAll('nav[epub\\:type="toc"] a, nav#toc a');
          links.forEach(a => {
            const label = a.textContent?.trim();
            const src = a.getAttribute("href");
            if (label && src) {
              const href = src.split('#')[0];
              if (!tocMap[href]) tocMap[href] = label;
            }
          });
        }
      }
    }

    const spineRefs = Array.from(opfDoc.querySelectorAll("spine > itemref"));
    
    let coverId = opfDoc.querySelector('meta[name="cover"]')?.getAttribute('content');

    if (!coverId) {
        const coverItem = opfDoc.querySelector('manifest > item[properties~="cover-image"]');
        if (coverItem) {
            coverId = coverItem.getAttribute('id');
        }
    }

    let coverPath: string | undefined = undefined;
    if (coverId && manifestItems[coverId]) {
        coverPath = opfDir + manifestItems[coverId];
    }

    const chapters: Chapter[] = [];
    const images: Record<string, Blob> = {};

    for (const [path, fileObj] of Object.entries(loadedZip.files)) {
      if (path.match(/\.(png|jpe?g|gif|svg|webp)$/i)) {
        const blob = await (fileObj as any).async("blob");
        images[path] = blob;
      }
    }

    // Pass 1: Parse spine elements
    for (const ref of spineRefs) {
      const id = ref.getAttribute("idref");
      if (!id || !manifestItems[id]) continue;
      
      const href = manifestItems[id];
      const fullPath = opfDir + href;
      const fileObj = loadedZip.file(fullPath);
      
      if (fileObj) {
        const htmlContent = await fileObj.async("string");
        const doc = parser.parseFromString(htmlContent, "text/html");
        
        let title = "";
        let isTocPoint = false;

        // 1. Try TOC Map first (Professional Standard)
        if (tocMap[href]) {
            title = tocMap[href];
            isTocPoint = true;
        }

        // 2. If not in TOC, check headings in content
        if (!title) {
            const headings = doc.querySelectorAll('h1, h2, h3');
            const isGarbageTitle = (raw: string) => {
                if (!raw) return true;
                const systemPattern = /^(part|page|item|file|index|xhtml|html|untitled|chapter|section|p|id|img|image|text|body|nav)\s?_?\d*$/i;
                // Extended garbage detection for purely technical labels
                const isSystem = systemPattern.test(raw) || /^[a-z0-9_\-]+$/i.test(raw);
                const isFileFormat = raw.toLowerCase().includes('.xhtml') || raw.toLowerCase().includes('.html');
                const isJustNumbers = /^\d+$/.test(raw);
                return (isSystem || isFileFormat || isJustNumbers) && raw.length < 15;
            };

            if (headings.length > 0) {
                const headTitle = headings[0].textContent?.trim() || "";
                if (!isGarbageTitle(headTitle)) {
                    title = headTitle;
                }
            }
        }
        
        // 3. Fallback: Inherit from previous or use a placeholder that won't pollute the TOC
        if (!title) {
            if (chapters.length > 0) {
                title = chapters[chapters.length - 1].title;
            } else {
                title = "Front Matter";
            }
        }
        
        const bodyContent = doc.body.innerHTML;
        const markdown = turndownService.turndown(bodyContent);

        const lowerTitle = title.trim().toLowerCase();
        const lowerHref = href.toLowerCase();

        const isSkippable = /^(copyright|colophon|imprint|legal|cover|title\s?page|table\s?of\s?contents|^toc$|dedication)/i.test(lowerTitle)
          || /(copyright|cover|title[\-_]?page|toc|contents)\.(xhtml|html|xml)$/i.test(lowerHref);

        const fileNameBase = lowerHref.split('/').pop() || "";
        const isReference = /^(references|bibliography|works\s?cited|sources|credits|notes|endnotes|footnotes)(\s|$)/i.test(lowerTitle)
          || /^(references|bibliography|notes|footnotes?|endnotes?|_fn\d+)[-_]?\d*\.(xhtml|html|xml)$/i.test(fileNameBase);

        chapters.push({
          id,
          index: chapters.length,
          fileName: href,
          title,
          content: htmlContent,
          markdown: markdown,
          isSkippable,
          isReference,
          isTocPoint
        });
      }
    }

    return { 
      chapters, 
      images, 
      coverPath,
      opfPath,
      opfDir,
      cssFiles
    };
  }

  async generateEpub(
    chapters: Chapter[], 
    originalZip: JSZip, 
    opfPath: string, 
    opfDir: string,
    cssFiles: string[],
    title: string,
    targetLanguage: string = "English",
    cssOverrides?: string,
    excludeFileNames?: string[]
  ): Promise<Blob> {
    const zip = originalZip;
    const isChinese = targetLanguage.toLowerCase().includes('chinese');
    const defaultCss = isChinese ? CHINESE_EPUB_CSS : DEFAULT_EPUB_CSS;
    const cssToUse = cssOverrides || defaultCss;

    // 1. Update title in OPF
    const opfFile = zip.file(opfPath);
    if (opfFile) {
      let opfContent = await opfFile.async("string");
      
      const titlePattern = /<dc:title>[^<]*<\/dc:title>/i;
      const safeTitle = escapeXml(title).trim();
      const fullBookTitle = `${safeTitle}【TransLit】`;
      if (titlePattern.test(opfContent)) {
        opfContent = opfContent.replace(titlePattern, `<dc:title>${fullBookTitle}</dc:title>`);
      }
      
      const langPattern = /<dc:language>[^<]*<\/dc:language>/i;
      if (langPattern.test(opfContent)) {
        opfContent = opfContent.replace(langPattern, `<dc:language>${isChinese ? 'zh' : 'en'}</dc:language>`);
      }
      
      zip.file(opfPath, opfContent);
    }

    // 1b. Remove excluded chapters (skipped + reference/footnote pages) from OPF, ZIP, and TOC
    if (excludeFileNames && excludeFileNames.length > 0) {
      const currentOpfFile = zip.file(opfPath);
      if (currentOpfFile) {
        let opfContent = await currentOpfFile.async("string");
        const parser = new DOMParser();
        const opfDoc = parser.parseFromString(opfContent, "application/xml");
        const excludeSet = new Set(excludeFileNames);

        // Find manifest item IDs whose href matches excluded fileNames
        const idsToRemove = new Set<string>();
        let ncxHref: string | null = null;
        let navHref: string | null = null;

        for (const item of Array.from(opfDoc.querySelectorAll("*"))) {
          if (item.localName === "item") {
            const href = item.getAttribute("href");
            const id = item.getAttribute("id");
            const properties = item.getAttribute("properties");
            
            if (href && id && excludeSet.has(href)) {
              idsToRemove.add(id);
              item.remove();
              // Delete the physical XHTML file from ZIP
              const fullPath = opfDir + href;
              if (zip.file(fullPath)) {
                zip.remove(fullPath);
              }
            }
            
            // Identify EPUB3 NAV
            if (properties && properties.split(/\s+/).includes("nav")) {
              navHref = href;
            }
          }
        }

        // Remove corresponding <itemref> entries from <spine>
        let tocId: string | null = null;
        for (const ref of Array.from(opfDoc.querySelectorAll("*"))) {
          if (ref.localName === "spine") {
            tocId = ref.getAttribute("toc");
          } else if (ref.localName === "itemref") {
            const idref = ref.getAttribute("idref");
            if (idref && idsToRemove.has(idref)) {
              ref.remove();
            }
          }
        }

        // Identify EPUB2 NCX
        if (tocId) {
          for (const item of Array.from(opfDoc.querySelectorAll("*"))) {
            if (item.localName === "item" && item.getAttribute("id") === tocId) {
              ncxHref = item.getAttribute("href");
              break;
            }
          }
        }

        // Helper to check if a href points to an excluded file
        const isExcluded = (link: string | null) => {
          if (!link) return false;
          let baseLink = '';
          try {
             baseLink = decodeURIComponent(link.split('#')[0]);
          } catch(e) {
             baseLink = link.split('#')[0];
          }
          return Array.from(excludeSet).some(ex => {
             let decodedEx = ex;
             try { decodedEx = decodeURIComponent(ex); } catch(e) {}
             if (decodedEx === baseLink) return true;
             if (decodedEx.endsWith('/' + baseLink)) return true;
             if (baseLink.endsWith('/' + decodedEx)) return true;
             return false;
          });
        };

        // Serialize OPF back and write
        const serializer = new XMLSerializer();
        zip.file(opfPath, serializer.serializeToString(opfDoc));

        // Clean up EPUB2 NCX
        if (ncxHref) {
          const ncxPath = opfDir + ncxHref;
          const ncxFile = zip.file(ncxPath);
          if (ncxFile) {
            const ncxContent = await ncxFile.async("string");
            const ncxDoc = parser.parseFromString(ncxContent, "application/xml");
            for (const el of Array.from(ncxDoc.querySelectorAll("*")).reverse()) {
              if (el.localName === 'navPoint') {
                let contentNode: Element | null = null;
                for (const child of Array.from(el.children)) {
                  if (child.localName === 'content') {
                    contentNode = child;
                    break;
                  }
                }
                if (contentNode && isExcluded(contentNode.getAttribute("src"))) {
                  // Rescue children navPoints before removing the parent
                  const childNavPoints = Array.from(el.children).filter(c => c.localName === 'navPoint');
                  for (const child of childNavPoints) {
                    if (el.parentElement) el.parentElement.insertBefore(child, el);
                  }
                  el.remove();
                }
              }
            }
            zip.file(ncxPath, serializer.serializeToString(ncxDoc));
          }
        }

        // Clean up EPUB3 NAV
        if (navHref) {
          const navPath = opfDir + navHref;
          const navFile = zip.file(navPath);
          if (navFile) {
            const navContent = await navFile.async("string");
            const navDoc = parser.parseFromString(navContent, "application/xml");
            for (const el of Array.from(navDoc.querySelectorAll("*")).reverse()) {
              if (el.localName === 'a') {
                if (isExcluded(el.getAttribute("href"))) {
                  let li: Element | null = el;
                  while (li && li.localName !== 'li') {
                    li = li.parentElement;
                  }
                  if (li) {
                    // Rescue child <li> elements from nested <ol> before removing the parent <li>
                    const childOls = Array.from(li.children).filter(c => c.localName === 'ol');
                    for (const ol of childOls) {
                      const childLis = Array.from(ol.children).filter(c => c.localName === 'li');
                      for (const childLi of childLis) {
                        if (li.parentElement) li.parentElement.insertBefore(childLi, li);
                      }
                    }
                    li.remove();
                  }
                }
              }
            }
            zip.file(navPath, serializer.serializeToString(navDoc));
          }
        }
      }
    }

    // 2. Overwrite CSS files
    if (cssFiles && cssFiles.length > 0) {
      for (const cssPath of cssFiles) {
        zip.file(cssPath, cssToUse);
      }
    } else {
      // Fallback: If no CSS files found in OPF, check common locations
      const commonCssPaths = ["css/styles.css", "OEBPS/css/styles.css", "stylesheet.css", "styles.css"];
      for (const path of commonCssPaths) {
        if (zip.file(path) || zip.file(opfDir + path)) {
          zip.file(zip.file(path) ? path : opfDir + path, cssToUse);
        }
      }
    }

    // 3. Replace body of each translated/proofread XHTML chapter
    for (const ch of chapters) {
      if (!ch.translatedMarkdown && !ch.proofreadMarkdown) continue;

      const fullPath = opfDir + ch.fileName;
      const originalXhtmlFile = zip.file(fullPath);
      if (!originalXhtmlFile) continue;

      const originalXhtml = await originalXhtmlFile.async("string");
      let contentToUse = ch.proofreadMarkdown || ch.translatedMarkdown || ch.markdown || "";

      // Fix full-width colon and spacing in footnote definitions caused by AI translation
      contentToUse = contentToUse.replace(/^[ \t]*\[\^([^\]]+)\][：:][ \t]*/gm, '[^$1]: ');

      // Structure-aware line joining: keep table rows and list items
      // on consecutive lines (\n), only separate paragraphs with \n\n
      const isTableRow = (line: string) => /^\|/.test(line);
      const isListItem = (line: string) => /^[-*+]\s|^\d+[.)]\s/.test(line);
      const trimmedLines = contentToUse.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const mdParts: string[] = [];
      for (let i = 0; i < trimmedLines.length; i++) {
        mdParts.push(trimmedLines[i]);
        if (i < trimmedLines.length - 1) {
          const curr = trimmedLines[i];
          const next = trimmedLines[i + 1];
          if ((isTableRow(curr) && isTableRow(next)) ||
              (isListItem(curr) && isListItem(next))) {
            mdParts.push('\n');
          } else {
            mdParts.push('\n\n');
          }
        }
      }
      const processedMarkdown = mdParts.join('');

      let htmlBody = await marked(processedMarkdown, {
        breaks: true,
        gfm: true
      });

      htmlBody = htmlBody
        .replace(/<br>/g, '<br/>')
        .replace(/<hr>/g, '<hr/>')
        .replace(/<img([^>]*)>/g, '<img$1/>');

      // Preserve original relative image links
      htmlBody = htmlBody.replace(/src="([^"]+)"/g, (match, srcPath) => {
        if (srcPath.startsWith('http') || srcPath.startsWith('//')) return match;
        return `src="${srcPath}"`;
      });

      let newXhtml = originalXhtml;
      if (originalXhtml.match(/<body[^>]*>/i)) {
        newXhtml = originalXhtml.replace(/<body[^>]*>([\s\S]*)<\/body>/i, () => {
          const bodyTagMatch = originalXhtml.match(/<body[^>]*>/i);
          const bodyTag = bodyTagMatch ? bodyTagMatch[0] : '<body>';
          return `${bodyTag}\n${htmlBody}\n</body>`;
        });
      } else {
        newXhtml = `<?xml version='1.0' encoding='utf-8'?>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<body>\n${htmlBody}\n</body>\n</html>`;
      }

      zip.file(fullPath, newXhtml);
    }

    // Ensure mimetype is first file and STORE
    if (zip.file("mimetype")) {
      const mimeBlob = await zip.file("mimetype")!.async("string");
      zip.remove("mimetype");
      zip.file("mimetype", mimeBlob, { compression: "STORE" });
    }

    return await zip.generateAsync({ type: "blob" });
  }
}