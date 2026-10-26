// Форма site/public/data.json — то, что пишет scripts/lib/build.js. Здесь только поля, нужные сайту.

export type LinkStatus = 'confirmed' | 'hypothesis' | 'disputed';

export interface Link {
  person: string;
  status: LinkStatus;
  claims?: Claim[];
}

export type Confidence = 'document' | 'oral' | 'hypothesis' | 'conflict';

export interface Claim {
  source: string;
  confidence: Confidence;
  detail?: string;
  note?: string;
}

export interface NameRecord {
  type?: 'birth' | 'married' | 'changed' | 'baptismal' | 'variant' | 'nickname';
  surname?: string;
  given?: string;
  patronymic?: string;
  claims?: Claim[];
}

export interface Participant {
  person?: string;
  name?: string;
  role: 'spouse' | 'godparent' | 'witness' | 'informant' | 'priest' | 'parent' | 'other';
  note?: string;
}

export interface LifeEvent {
  type: string;
  title?: string;
  date?: string | number;
  place?: string;
  participants?: Participant[];
  claims?: Claim[];
  note?: string;
  year: number | null;
  qualifier: Qualifier;
}

export interface Era {
  date: string | number;
  year: number;
  title: string;
  region?: string;
  age: number;
}

export interface Source {
  id: string;
  kind: string;
  title: string;
  url?: string;
  archive?: string;
  fond?: string;
  opis?: string;
  delo?: string;
  list?: string;
  reliability: 'original' | 'derivative' | 'authored' | 'oral';
  date?: string;
  note?: string;
}

export interface Media {
  id: string;
  file: string;
  kind: 'photo' | 'portrait' | 'scan' | 'audio' | 'video' | 'other';
  persons?: string[];
  source?: string;
  caption?: string;
  date?: string;
  private?: boolean;
  url: string;
}

export interface Place {
  id: string;
  name_then: string;
  name_now?: string;
  coords?: { lat: number; lon: number; precision: 'exact' | 'approx'; how?: string };
  /** ссылка на место на карте (например, Яндекс.Карты) */
  url?: string;
}

export type Qualifier = 'exact' | 'about' | 'before' | 'after' | 'between' | 'estimated' | null;

export interface Person {
  id: string;
  sex: 'M' | 'F' | 'U';
  living?: boolean;
  name: { full: string; short: string; maiden: string | null; married: string | null };
  birthYear: number | null;
  birthQualifier: Qualifier;
  deathYear: number | null;
  deathQualifier: Qualifier;
  names: NameRecord[];
  events?: LifeEvent[];
  lifeline?: Era[];
  storyText?: string | null;
  /** рассказ по документам поиска (data/stories/research/<id>.md) */
  researchText?: string | null;
  /** до владельца можно дойти только по подтверждённым связям */
  certain?: boolean;
  estate?: string;
  religion?: string;
  parents?: Link[];
  spouses?: Link[];
  children?: Link[];
  relation: { label: string; line: string | null; uncertain: boolean; blood: boolean } | null;
  ahnentafel: number | null;
  generation: number | null;
  portraitFile?: string | null;
  note?: string;
}

export interface Question {
  ask: 'papa' | 'mama' | 'search' | 'other';
  about: string[];
  text: string;
  status: 'open' | 'answered';
  answer?: string;
}

export interface SearchLogEntry {
  date: string;
  persons?: string[];
  where: string;
  query?: string;
  result: 'found' | 'not_found' | 'partial';
  summary?: string;
  sources?: string[];
  next?: string;
  note?: string;
}

export type RequestStatus = 'draft' | 'sent' | 'paid' | 'answered' | 'refused' | 'cancelled';

export interface ArchiveRequest {
  id: string;
  to: string;
  about?: string[];
  what: string;
  status: RequestStatus;
  sent?: string;
  due?: string;
  cost?: number;
  answer?: string;
  note?: string;
}

export interface Archive {
  id: string;
  name: string;
  short?: string;
}

export interface PlaceLink {
  title: string;
  url: string;
  /** точка на Яндекс.Картах — значок рядом с названием */
  map?: string;
  match: string[];
}

export interface SiteData {
  meta: { root: string; title: string; builtAt: string };
  people: Person[];
  sources: Source[];
  media?: Media[];
  places: Place[];
  questions?: Question[];
  searchLog?: SearchLogEntry[];
  requests?: ArchiveRequest[];
  archives?: Archive[];
  /** ссылки на места: каждое упоминание в тексте становится ссылкой (data/reference/place-links.yaml) */
  placeLinks?: PlaceLink[];
  /** раскладка древа, посчитанная при сборке (узлы — списком) */
  layout?: Omit<import('./layout').TreeLayout, 'nodes'> & { nodes: import('./layout').PlacedNode[] };
}
