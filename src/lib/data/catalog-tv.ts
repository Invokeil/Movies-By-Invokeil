import type { UnifiedMedia, CastMember, SeasonInfo } from '../types'

interface TvExtras {
  seasons: SeasonInfo[]
  episodeRuntime?: number
  malId?: number
}

const mk = (
  tmdbId: number,
  title: string,
  year: number,
  genres: string[],
  voteAverage: number,
  voteCount: number,
  popularity: number,
  overview: string,
  creator: string,
  cast: [string, string][],
  seasons: SeasonInfo[],
  lang = 'en',
  extras: Partial<UnifiedMedia> = {}
): UnifiedMedia => ({
  id: `tv-${tmdbId}`,
  mediaType: 'tv',
  tmdbId,
  title,
  overview,
  releaseDate: `${year}-0${((tmdbId % 9) + 1)}-1${(tmdbId % 9)}`,
  year,
  genres,
  voteAverage,
  voteCount,
  popularity,
  originalLanguage: lang,
  cast: cast.map(([name, character]) => ({ name, character }) as CastMember),
  director: creator,
  seasons,
  episodeRuntime: 48,
  ...extras,
})

export const TV_SHOWS: UnifiedMedia[] = [
  mk(1396, 'Breaking Bad', 2008, ['Drama', 'Crime', 'Thriller'], 8.9, 13400, 198,
    'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine to secure his family\'s future.',
    'Vince Gilligan',
    [['Bryan Cranston', 'Walter White'], ['Aaron Paul', 'Jesse Pinkman'], ['Anna Gunn', 'Skyler'], ['Giancarlo Esposito', 'Gus']],
    [{ season: 1, episodes: 7 }, { season: 2, episodes: 13 }, { season: 3, episodes: 13 }, { season: 4, episodes: 13 }, { season: 5, episodes: 16 }],
    'en', { imdbRating: 9.5, rated: 'TV-MA', awards: 'Won 16 Emmys' }),

  mk(1399, 'Game of Thrones', 2011, ['Drama', 'Fantasy', 'Adventure'], 8.4, 22800, 176,
    'Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns after being dormant for millennia.',
    'David Benioff',
    [['Emilia Clarke', 'Daenerys'], ['Peter Dinklage', 'Tyrion'], ['Kit Harington', 'Jon Snow'], ['Sophie Turner', 'Sansa']],
    [{ season: 1, episodes: 10 }, { season: 2, episodes: 10 }, { season: 3, episodes: 10 }, { season: 4, episodes: 10 }, { season: 5, episodes: 10 }, { season: 6, episodes: 10 }, { season: 7, episodes: 7 }, { season: 8, episodes: 6 }],
    'en', { imdbRating: 9.2, rated: 'TV-MA', awards: 'Won 59 Emmys' }),

  mk(66732, 'Stranger Things', 2016, ['Sci-Fi', 'Mystery', 'Drama'], 8.6, 16200, 310,
    'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
    'The Duffer Brothers',
    [['Millie Bobby Brown', 'Eleven'], ['Finn Wolfhard', 'Mike'], ['David Harbour', 'Hopper'], ['Winona Ryder', 'Joyce']],
    [{ season: 1, episodes: 8 }, { season: 2, episodes: 9 }, { season: 3, episodes: 8 }, { season: 4, episodes: 9 }],
    'en', { imdbRating: 8.7, rated: 'TV-14' }),

  mk(100088, 'The Last of Us', 2023, ['Drama', 'Sci-Fi', 'Adventure'], 8.4, 4800, 286,
    'Twenty years after modern civilization has been destroyed, a hardened survivor is hired to smuggle a 14-year-old girl out of an oppressive quarantine zone.',
    'Craig Mazin',
    [['Pedro Pascal', 'Joel'], ['Bella Ramsey', 'Ellie'], ['Gabriel Luna', 'Tommy'], ['Anna Torv', 'Tess']],
    [{ season: 1, episodes: 9 }, { season: 2, episodes: 7 }],
    'en', { imdbRating: 8.7, rated: 'TV-MA' }),

  mk(87108, 'Chernobyl', 2019, ['Drama', 'History', 'Thriller'], 8.7, 8300, 122,
    'The true story of the April 1986 nuclear disaster at the Chernobyl Nuclear Power Plant and the unparalleled sacrifice and heroism of those who fought it.',
    'Craig Mazin',
    [['Jared Harris', 'Legasov'], ['Stellan Skarsgård', 'Shcherbina'], ['Emily Watson', 'Ulana'], ['Paul Ritter', 'Dyatlov']],
    [{ season: 1, episodes: 5 }],
    'en', { imdbRating: 9.3, rated: 'TV-MA', awards: 'Won 10 Emmys' }),

  mk(70523, 'Dark', 2017, ['Sci-Fi', 'Mystery', 'Thriller'], 8.4, 5300, 118,
    'A family saga with a supernatural twist, set in a German town where the disappearance of two young children exposes the double lives and fractured relationships among four families.',
    'Baran bo Odar',
    [['Louis Hofmann', 'Jonas'], ['Lisa Vicari', 'Martha'], ['Oliver Masucci', 'Ulrich'], ['Maja Schöne', 'Hannah']],
    [{ season: 1, episodes: 10 }, { season: 2, episodes: 8 }, { season: 3, episodes: 8 }],
    'de', { imdbRating: 8.7, rated: 'TV-MA' }),

  mk(136315, 'The Bear', 2022, ['Drama', 'Comedy'], 8.4, 2900, 168,
    'A young chef from the fine dining world returns to Chicago to run his family\'s chaotic sandwich shop after a devastating loss.',
    'Christopher Storer',
    [['Jeremy Allen White', 'Carmy'], ['Ayo Edebiri', 'Sydney'], ['Ebon Moss-Bachrach', 'Richie'], ['Abby Elliott', 'Natalie']],
    [{ season: 1, episodes: 8 }, { season: 2, episodes: 10 }, { season: 3, episodes: 10 }],
    'en', { imdbRating: 8.6, rated: 'TV-MA', awards: 'Won 10 Emmys' }),

  mk(94605, 'Arcane', 2021, ['Animation', 'Action', 'Fantasy'], 8.8, 4900, 224,
    'Amid the stark discord of twin cities Piltover and Zaun, two sisters fight on rival sides of a war between magic technologies and clashing convictions.',
    'Christian Linke',
    [['Hailee Steinfeld', 'Vi'], ['Ella Purnell', 'Jinx'], ['Kevin Alejandro', 'Jayce'], ['Katie Leung', 'Caitlyn']],
    [{ season: 1, episodes: 9 }, { season: 2, episodes: 9 }],
    'en', { imdbRating: 9.0, rated: 'TV-14', awards: 'Won 4 Emmys' }),

  mk(93405, 'Squid Game', 2021, ['Drama', 'Thriller', 'Mystery'], 7.8, 11800, 264,
    'Hundreds of cash-strapped players accept a strange invitation to compete in children\'s games with a tempting prize — with deadly high stakes.',
    'Hwang Dong-hyuk',
    [['Lee Jung-jae', 'Gi-hun'], ['Park Hae-soo', 'Sang-woo'], ['Wi Ha-joon', 'Jun-ho'], ['Jung Ho-yeon', 'Sae-byeok']],
    [{ season: 1, episodes: 9 }, { season: 2, episodes: 7 }, { season: 3, episodes: 6 }],
    'ko', { imdbRating: 8.0, rated: 'TV-MA', awards: 'Won 6 Emmys' }),

  mk(95396, 'Severance', 2022, ['Sci-Fi', 'Thriller', 'Drama'], 8.4, 3400, 198,
    'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives — until an anomaly unravels everything.',
    'Dan Erickson',
    [['Adam Scott', 'Mark'], ['Britt Lower', 'Helly'], ['Zach Cherry', 'Dylan'], ['John Turturro', 'Irving']],
    [{ season: 1, episodes: 9 }, { season: 2, episodes: 10 }],
    'en', { imdbRating: 8.7, rated: 'TV-MA' }),

  mk(76479, 'The Boys', 2019, ['Action', 'Sci-Fi', 'Comedy'], 8.5, 9800, 242,
    'A group of vigilantes set out to take down corrupt superheroes who abuse their celestial powers.',
    'Eric Kripke',
    [['Karl Urban', 'Butcher'], ['Jack Quaid', 'Hughie'], ['Antony Starr', 'Homelander'], ['Erin Moriarty', 'Annie']],
    [{ season: 1, episodes: 8 }, { season: 2, episodes: 8 }, { season: 3, episodes: 8 }, { season: 4, episodes: 8 }],
    'en', { imdbRating: 8.7, rated: 'TV-MA' }),

  mk(76669, 'Succession', 2018, ['Drama'], 8.4, 4600, 128,
    'The Roy family — owners of a global media empire — fight for control of the company amid uncertainty about the health of the family\'s patriarch.',
    'Jesse Armstrong',
    [['Brian Cox', 'Logan Roy'], ['Jeremy Strong', 'Kendall'], ['Sarah Snook', 'Shiv'], ['Kieran Culkin', 'Roman']],
    [{ season: 1, episodes: 10 }, { season: 2, episodes: 10 }, { season: 3, episodes: 9 }, { season: 4, episodes: 10 }],
    'en', { imdbRating: 8.9, rated: 'TV-MA', awards: 'Won 19 Emmys' }),

  mk(119051, 'Wednesday', 2022, ['Comedy', 'Fantasy', 'Mystery'], 8.3, 8600, 254,
    'Wednesday Addams navigates her years at Nevermore Academy, where she attempts to master her emerging psychic ability and solve a supernatural mystery.',
    'Alfred Gough',
    [['Jenna Ortega', 'Wednesday'], ['Emma Myers', 'Enid'], ['Catherine Zeta-Jones', 'Morticia'], ['Gwendoline Christie', 'Larissa']],
    [{ season: 1, episodes: 8 }],
    'en', { imdbRating: 8.1, rated: 'TV-14' }),

  mk(88329, 'The Queen\'s Gambit', 2020, ['Drama'], 8.5, 4300, 112,
    'In a 1960s orphanage, a young girl discovers an astonishing talent for chess while struggling with addiction.',
    'Scott Frank',
    [['Anya Taylor-Joy', 'Beth'], ['Bill Camp', 'Mr. Shaibel'], ['Moses Ingram', 'Jolene'], ['Chloe Pirrie', 'Alice']],
    [{ season: 1, episodes: 7 }],
    'en', { imdbRating: 8.5, rated: 'TV-MA', awards: 'Won 2 Emmys' }),
]

/* ── Anime (TMDB + MAL dual identity) ──────────────────────────────── */

const anime = (
  tmdbId: number,
  malId: number,
  title: string,
  year: number,
  genres: string[],
  voteAverage: number,
  voteCount: number,
  popularity: number,
  overview: string,
  creator: string,
  cast: [string, string][],
  seasons: SeasonInfo[],
  extras: Partial<UnifiedMedia> = {}
): UnifiedMedia => ({
  ...mk(tmdbId, title, year, genres, voteAverage, voteCount, popularity,
    overview, creator, cast, seasons, 'ja'),
  id: `anime-${tmdbId}`,
  mediaType: 'anime',
  malId,
  ...extras,
})

export const ANIME: UnifiedMedia[] = [
  anime(1429, 16498, 'Attack on Titan', 2013, ['Animation', 'Action', 'Fantasy'], 8.7, 11800, 380,
    'After his hometown is destroyed, young Eren Jaeger vows to cleanse the earth of the giant humanoid Titans that have brought humanity to the edge of extinction.',
    'Tetsurō Araki',
    [['Yuki Kaji', 'Eren'], ['Marina Inoue', 'Armin'], ['Yui Ishikawa', 'Mikasa'], ['Hiroshi Kamiya', 'Levi']],
    [{ season: 1, episodes: 25 }, { season: 2, episodes: 12 }, { season: 3, episodes: 22 }, { season: 4, episodes: 28 }],
    { imdbRating: 9.1, rated: 'TV-MA' }),

  anime(85937, 38000, 'Demon Slayer: Kimetsu no Yaiba', 2019, ['Animation', 'Action', 'Fantasy'], 8.6, 8200, 342,
    'A young boy becomes a demon slayer after his family is slaughtered and his younger sister turns into a demon.',
    'Haruo Sotozaki',
    [['Natsuki Hanae', 'Tanjiro'], ['Akari Kitō', 'Nezuko'], ['Hiro Shimono', 'Zenitsu'], ['Yoshitsugu Matsuoka', 'Inosuke']],
    [{ season: 1, episodes: 26 }, { season: 2, episodes: 18 }, { season: 3, episodes: 11 }, { season: 4, episodes: 8 }],
    { imdbRating: 8.6, rated: 'TV-MA' }),

  anime(95479, 40748, 'Jujutsu Kaisen', 2020, ['Animation', 'Action', 'Supernatural'], 8.6, 6900, 356,
    'Yuji Itadori swallows a cursed finger to save his friends, becoming host to a legendary curse — and joining a secret school of jujutsu sorcerers.',
    'Sunghoo Park',
    [['Junya Enoki', 'Yuji'], ['Yuma Uchida', 'Megumi'], ['Asami Seto', 'Nobara'], ['Yuichi Nakamura', 'Gojo']],
    [{ season: 1, episodes: 24 }, { season: 2, episodes: 23 }],
    { imdbRating: 8.5, rated: 'TV-MA' }),

  anime(209867, 52991, 'Frieren: Beyond Journey\'s End', 2023, ['Animation', 'Fantasy', 'Adventure'], 8.9, 3200, 298,
    'After the hero\'s party defeats the Demon King, the elven mage Frieren embarks on a journey to truly understand humans — and the meaning of the time they shared.',
    'Keiichirō Saitō',
    [['Atsumi Tanezaki', 'Frieren'], ['Kobayashi Chiaki', 'Fern'], ['Koga Aoi', 'Stark'], ['Ishikawa Yojiro', 'Himmel']],
    [{ season: 1, episodes: 28 }],
    { imdbRating: 9.0, rated: 'TV-14' }),

  anime(37854, 21, 'One Piece', 1999, ['Animation', 'Action', 'Adventure'], 8.7, 14200, 420,
    'Follows the adventures of Monkey D. Luffy and his crew as they search the seas for the legendary treasure known as the "One Piece" to become King of the Pirates.',
    'Kōnosuke Uda',
    [['Mayumi Tanaka', 'Luffy'], ['Kazuya Nakai', 'Zoro'], ['Akemi Okamura', 'Nami'], ['Kappei Yamaguchi', 'Usopp']],
    [{ season: 1, episodes: 61 }, { season: 2, episodes: 16 }, { season: 3, episodes: 52 }, { season: 4, episodes: 58 }],
    { imdbRating: 8.9, rated: 'TV-14' }),

  anime(117591, 42310, 'Cyberpunk: Edgerunners', 2022, ['Animation', 'Sci-Fi', 'Action'], 8.4, 3100, 186,
    'A street kid tries to survive in a technology- and body-modification-obsessed city of the future, doing what it takes to become an edgerunner — a mercenary outlaw.',
    'Hiroyuki Imaishi',
    [['Kenn', 'David'], ['Aoi Yūki', 'Lucy'], ['Yurika Kubo', 'Rebecca'], ['Kazuya Nakai', 'Maine']],
    [{ season: 1, episodes: 10 }],
    { imdbRating: 8.3, rated: 'TV-MA' }),

  anime(13916, 1535, 'Death Note', 2006, ['Animation', 'Mystery', 'Thriller'], 8.7, 12800, 164,
    'An intelligent high school student goes on a secret crusade to eliminate criminals from the world after discovering a notebook granting its owner the power to kill.',
    'Tetsurō Araki',
    [['Mamoru Miyano', 'Light'], ['Kappei Yamaguchi', 'L'], ['Aya Hirano', 'Misa'], ['Nakamura Shidō', 'Ryuk']],
    [{ season: 1, episodes: 37 }],
    { imdbRating: 9.0, rated: 'TV-14' }),

  anime(31911, 5114, 'Fullmetal Alchemist: Brotherhood', 2009, ['Animation', 'Action', 'Adventure'], 8.9, 11400, 158,
    'Two brothers search for the Philosopher\'s Stone to restore their bodies after a failed alchemical ritual leaves them with devastating losses.',
    'Yasuhiro Irie',
    [['Romi Park', 'Edward'], ['Rie Kugimiya', 'Alphonse'], ['Mamoru Miyano', 'Ling'], ['Fumiko Orikasa', 'Riza']],
    [{ season: 1, episodes: 64 }],
    { imdbRating: 9.1, rated: 'TV-14' }),
]
