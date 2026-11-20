// Real book catalogue: Google Books (search, descriptions, covers) + Open Library (physical format by ISBN).
export type Book = {
  title: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  categories?: string[];
  description?: string;
  isbn13?: string;
  imageUrl?: string;
  infoUrl?: string;
  physicalFormat?: string; // "Hardcover" / "Paperback" (Open Library, when known)
  listPrice?: string;
};

const withTimeout = (ms: number) => AbortSignal.timeout(ms);

async function openLibraryFormat(isbn: string): Promise<string | undefined> {
  try {
    const r = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { signal: withTimeout(4000), redirect: "follow" });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { physical_format?: string };
    return j.physical_format;
  } catch {
    return undefined;
  }
}

export async function searchBooks(query: string, opts: { max?: number; country?: string } = {}): Promise<Book[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("printType", "books");
  url.searchParams.set("maxResults", String(Math.min(opts.max ?? 8, 20)));
  url.searchParams.set("langRestrict", "en");
  if (opts.country) url.searchParams.set("country", opts.country);
  const r = await fetch(url, { signal: withTimeout(8000) });
  if (!r.ok) return searchOpenLibrary(query, opts.max ?? 8);
  const j = (await r.json()) as { items?: any[] };
  const books: Book[] = (j.items ?? []).map((it) => {
    const v = it.volumeInfo ?? {};
    const isbn13 = (v.industryIdentifiers ?? []).find((x: any) => x.type === "ISBN_13")?.identifier;
    const lp = it.saleInfo?.listPrice;
    return {
      title: [v.title, v.subtitle].filter(Boolean).join(": "),
      authors: v.authors ?? [],
      publisher: v.publisher,
      publishedDate: v.publishedDate,
      pageCount: v.pageCount,
      categories: v.categories,
      description: v.description ? String(v.description).slice(0, 400) : undefined,
      isbn13,
      imageUrl: v.imageLinks?.thumbnail?.replace("http://", "https://"),
      infoUrl: v.infoLink ?? v.previewLink,
      listPrice: lp ? `${lp.amount} ${lp.currencyCode}` : undefined,
    };
  });
  await Promise.all(
    books.slice(0, 8).map(async (b) => {
      if (b.isbn13) b.physicalFormat = await openLibraryFormat(b.isbn13);
    }),
  );
  return books.length ? books : searchOpenLibrary(query, opts.max ?? 8);
}

async function searchOpenLibrary(query: string, max: number): Promise<Book[]> {
  const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${max}`, {
    signal: withTimeout(8000),
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { docs?: any[] };
  return (j.docs ?? []).map((d) => ({
    title: d.title,
    authors: d.author_name ?? [],
    publishedDate: d.first_publish_year ? String(d.first_publish_year) : undefined,
    pageCount: d.number_of_pages_median,
    isbn13: (d.isbn ?? []).find((x: string) => x.length === 13),
    imageUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
    infoUrl: d.key ? `https://openlibrary.org${d.key}` : undefined,
  }));
}
