import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../Markdown';

function render(md: string): string {
  return renderToStaticMarkup(createElement(Markdown, { children: md }));
}

describe('Markdown', () => {
  it('renders bold as <strong> rather than literal asterisks', () => {
    const html = render('**Top alternatives** to HubSpot');
    expect(html).toContain('<strong');
    expect(html).toContain('Top alternatives');
    expect(html).not.toContain('**');
  });

  it('renders bullet lists', () => {
    const html = render('- one\n- two\n- three');
    expect(html).toContain('<ul');
    expect(html.match(/<li/g)?.length).toBe(3);
  });

  it('renders ordered lists', () => {
    const html = render('1. first\n2. second');
    expect(html).toContain('<ol');
    expect(html.match(/<li/g)?.length).toBe(2);
  });

  it('renders GFM tables', () => {
    const html = render('| Tool | Focus |\n| --- | --- |\n| Zoho | CRM |');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
  });

  it('renders links that open safely in a new tab', () => {
    const html = render('See [the docs](https://example.com/x)');
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('does NOT render raw HTML embedded in the response (XSS-safe)', () => {
    const html = render('hello <script>alert(1)</script> world');
    // The script tag is escaped to text, never emitted as a live element.
    expect(html).not.toContain('<script>');
    expect(html).toContain('hello');
    expect(html).toContain('world');
  });

  it('strips images (no remote image loads in the panel)', () => {
    const html = render('![alt](https://example.com/img.png)');
    expect(html).not.toContain('<img');
  });
});
