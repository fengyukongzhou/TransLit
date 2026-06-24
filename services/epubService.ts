
import JSZip from 'jszip';
import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { Chapter } from '../types';

// Initialize Markdown converters
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
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
  async parseEpub(file: File): Promise<{ chapters: Chapter[], images: Record<string, Blob>, coverPath?: string }> {
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

        const isReference = /^(references|bibliography|works\s?cited|sources|credits|notes|endnotes)/i.test(lowerTitle)
          || /(references|bibliography|notes)\.(xhtml|html|xml)$/i.test(lowerHref);

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

    return { chapters, images, coverPath };
  }

  async generateEpub(
    chapters: Chapter[], 
    originalImages: Record<string, Blob>, 
    title: string,
    targetLanguage: string = "English",
    originalCoverPath?: string
  ): Promise<Blob> {
    const zip = new JSZip();

    const isChinese = targetLanguage.toLowerCase().includes('chinese');
    const cssToUse = isChinese ? CHINESE_EPUB_CSS : DEFAULT_EPUB_CSS;

    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    zip.file("META-INF/container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`);

    zip.file("css/styles.css", cssToUse);

    const processedImageNames = new Set<string>();
    let generatedCoverId: string | null = null;
    let manifestImages = '';

    for (const [path, blob] of Object.entries(originalImages)) {
      const fileName = path.split('/').pop();
      if (fileName && !processedImageNames.has(fileName)) {
        zip.file(`images/${fileName}`, blob);
        processedImageNames.add(fileName);

        const imgId = `img_${fileName.replace(/\W/g, '_')}`;
        
        let properties = "";
        if (originalCoverPath && path === originalCoverPath) {
            properties = ' properties="cover-image"';
            generatedCoverId = imgId;
        }

        let mime = "image/jpeg";
        if (fileName.endsWith('.png')) mime = "image/png";
        if (fileName.endsWith('.gif')) mime = "image/gif";
        if (fileName.endsWith('.svg')) mime = "image/svg+xml";
        if (fileName.endsWith('.webp')) mime = "image/webp";

        manifestImages += `<item id="${imgId}" href="images/${fileName}" media-type="${mime}"${properties}/>\n`;
      }
    }

    let manifestItems = '';
    manifestItems += '<item id="css" href="css/styles.css" media-type="text/css"/>\n';
    
    manifestItems += manifestImages;

    let spineItems = '';
    let navPoints = '';
    let navList = '';
    let lastAddedTitle = '';
    let navCount = 0;

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const contentToUse = ch.proofreadMarkdown || ch.translatedMarkdown || ch.markdown || "";
      
      // Pre-process markdown to ensure single line breaks between text are treated as paragraph breaks.
      // This helps when AI outputs single newlines instead of double newlines for dialogue.
      const processedMarkdown = contentToUse
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n');

      let htmlBody = await marked(processedMarkdown, {
        breaks: true,
        gfm: true
      });
      
      // XHTML Compliance: Close unclosed tags commonly generated by markdown parsers
      htmlBody = htmlBody
        .replace(/<br>/g, '<br/>')
        .replace(/<hr>/g, '<hr/>')
        .replace(/<img([^>]*)>/g, '<img$1/>');

      htmlBody = htmlBody.replace(/src="([^"]+)"/g, (match, srcPath) => {
        if (srcPath.startsWith('http') || srcPath.startsWith('//')) return match;
        
        const fileName = srcPath.split('/').pop();
        if (fileName) {
          return `src="images/${fileName}"`;
        }
        return match;
      });

      const safeTitle = escapeXml(ch.title).trim();
      
      // XHTML Compliance: Close unclosed tags commonly generated by markdown parsers
      htmlBody = htmlBody
        .replace(/<br>/g, '<br/>')
        .replace(/<hr>/g, '<hr/>')
        .replace(/<img([^>]*)>/g, '<img$1/>');

      htmlBody = htmlBody.replace(/src="([^"]+)"/g, (match, srcPath) => {
        if (srcPath.startsWith('http') || srcPath.startsWith('//')) return match;
        
        const fileName = srcPath.split('/').pop();
        if (fileName) {
          return `src="images/${fileName}"`;
        }
        return match;
      });

      // Added xmlns:m for MathML support
      const fullHtml = `<?xml version='1.0' encoding='utf-8'?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:m="http://www.w3.org/1998/Math/MathML" lang="${isChinese ? 'zh' : 'en'}">
<head>
  <title>${safeTitle || 'Chapter'}</title>
  <link rel="stylesheet" href="css/styles.css" type="text/css"/>
</head>
<body>
${htmlBody}
</body>
</html>`;

      const fileName = `page_${i + 1}.xhtml`;
      zip.file(fileName, fullHtml);

      const id = `ch${i+1}`;
      manifestItems += `<item id="${id}" href="${fileName}" media-type="application/xhtml+xml"/>\n`;
      spineItems += `<itemref idref="${id}"/>\n`;
      
      // TOC Entry logic: Respect isTocPoint or force first chapter
      if (ch.isTocPoint || (i === 0 && !chapters.some(c => c.isTocPoint))) {
        navCount++;
        navPoints += `<navPoint id="nav${navCount}" playOrder="${navCount}">
          <navLabel><text>${safeTitle}</text></navLabel>
          <content src="${fileName}"/>
        </navPoint>\n`;

        navList += `<li><a href="${fileName}">${safeTitle}</a></li>\n`;
      }
    }

    const navContent = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${isChinese ? 'zh' : 'en'}">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" href="css/styles.css" type="text/css"/>
  <meta charset="utf-8" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${navList}
    </ol>
  </nav>
  <nav epub:type="landmarks" hidden="hidden">
    <ol>
      <li><a epub:type="toc" href="nav.xhtml">Table of Contents</a></li>
    </ol>
  </nav>
</body>
</html>`;
    
    zip.file("nav.xhtml", navContent);

    const safeBookTitle = escapeXml(title || 'Untitled Book');
    const fullBookTitle = `${safeBookTitle}【TransLit】`;
    const uuid = `urn:uuid:${crypto.randomUUID()}`;
    const date = new Date().toISOString().split('T')[0];
    
    const coverMeta = generatedCoverId ? `<meta name="cover" content="${generatedCoverId}" />` : '';

    manifestItems += `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n`;

    const opfContent = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
    <dc:title>${fullBookTitle}</dc:title>
    <dc:language>${isChinese ? 'zh' : 'en'}</dc:language>
    <dc:identifier id="uuid_id">${uuid}</dc:identifier>
    <dc:date>${date}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
    ${coverMeta}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="nav" linear="no"/>
    ${spineItems}
  </spine>
</package>`;

    zip.file("content.opf", opfContent);

    const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${fullBookTitle}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`;
    
    zip.file("toc.ncx", ncxContent);

    return await zip.generateAsync({ type: "blob" });
  }
}