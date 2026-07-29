import type { Achievement } from './achievementTypes';

export const ALL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_game',
    name: 'First Steps',
    description: 'Complete your first location-guessing game',
    emoji: '🎮',
    category: 'getting-started'
  },
  {
    id: 'first_date_game',
    name: 'Time Traveller',
    description: 'Complete your first date-guessing game',
    emoji: '🕰️',
    category: 'getting-started'
  },
  {
    id: 'first_uploader_game',
    name: 'Familiar Faces',
    description: 'Complete your first game of matching photos to players',
    emoji: '👥',
    category: 'getting-started'
  },
  {
    id: 'uploader_detective',
    name: 'Inner Circle',
    description: 'Correctly match five photos to the players who uploaded them',
    emoji: '🕵️',
    category: 'accuracy',
    target: 5
  },
  {
    id: 'uploader_expert',
    name: 'People Person',
    description: 'Correctly match twenty photos to the players who uploaded them',
    emoji: '🤝',
    category: 'accuracy',
    target: 20
  },
  {
    id: 'identity_streak',
    name: 'I Know You',
    description: 'Correctly match three photos to their players in a row',
    emoji: '🧠',
    category: 'momentum'
  },
  {
    id: 'date_bullseye',
    name: 'Perfect Timing',
    description: 'Guess a photo date exactly',
    emoji: '📅',
    category: 'accuracy'
  },
  {
    id: 'date_detective',
    name: 'Date Detective',
    description: 'Get within 7 days of the photo date five times',
    emoji: '🔎',
    category: 'accuracy',
    target: 5
  },
  {
    id: 'calendar_regular',
    name: 'Calendar Regular',
    description: 'Get within 30 days of the photo date ten times',
    emoji: '🗓️',
    category: 'accuracy',
    target: 10
  },
  {
    id: 'date_marathon',
    name: 'Through the Ages',
    description: 'Make twenty-five date guesses',
    emoji: '⌛',
    category: 'momentum',
    target: 25
  },
  {
    id: 'archive_explorer',
    name: 'Archive Explorer',
    description: 'Get within one year on a photo at least 75 years old',
    emoji: '🗄️',
    category: 'accuracy'
  },
  {
    id: 'first_win',
    name: 'First Victory',
    description: 'Win your first game',
    emoji: '🏆',
    category: 'getting-started'
  },
  {
    id: 'correct_country',
    name: 'Globetrotter',
    description: 'Guess the correct country 3 times',
    emoji: '🌍',
    category: 'getting-started',
    target: 3
  },
  {
    id: 'correct_region',
    name: 'Region Expert',
    description: 'Guess the correct region 3 times',
    emoji: '🗺️',
    category: 'getting-started',
    target: 3
  },

  {
    id: 'perfect_guess',
    name: 'Bullseye!',
    description: 'Make 3 perfect guesses',
    emoji: '🎯',
    category: 'accuracy',
    target: 3
  },
  {
    id: 'five_k',
    name: 'High Scorer',
    description: 'Score a perfect 5,000 points in a single round',
    emoji: '⭐',
    category: 'accuracy'
  },
  {
    id: 'ten_k_score',
    name: 'Elite Scorer',
    description: 'Score 4,500+ points in 5 rounds',
    emoji: '💎',
    category: 'accuracy',
    target: 5
  },
  {
    id: 'close_guesses',
    name: 'Eagle Eye',
    description: 'Get within 10km of the target 5 times',
    emoji: '🦅',
    category: 'accuracy',
    target: 5
  },
  {
    id: 'medium_guesses',
    name: 'Sharp Shooter',
    description: 'Get within 100km of the target 20 times',
    emoji: '🎯',
    category: 'accuracy',
    target: 20
  },
  {
    id: 'consistent_scoring',
    name: 'Reliable Player',
    description: 'Score 3000+ points in 10 consecutive rounds',
    emoji: '📈',
    category: 'accuracy',
    target: 10
  },

  {
    id: 'correct_streak',
    name: 'On Fire',
    description: 'Get 5 correct countries in a row',
    emoji: '🔥',
    category: 'momentum'
  },
  {
    id: 'win_streak',
    name: 'Winning Streak',
    description: 'Win 5 games in a row',
    emoji: '⚡',
    category: 'momentum',
    target: 5
  },
  {
    id: 'fast_guesses',
    name: 'Speed Demon',
    description: 'Make 10 guesses under 10 seconds each',
    emoji: '💨',
    category: 'momentum',
    target: 10
  },
  {
    id: 'perfect_rounds',
    name: 'Round Master',
    description: 'Win 6 rounds in a row',
    emoji: '👑',
    category: 'momentum',
    target: 6
  },
  {
    id: 'daily_player',
    name: 'Daily Player',
    description: 'Play at least one game for 3 consecutive days',
    emoji: '📅',
    category: 'momentum',
    target: 3
  },
  {
    id: 'game_night',
    name: 'Game Night',
    description: 'Complete 20 games',
    emoji: '🌙',
    category: 'momentum',
    target: 20
  },

  {
    id: 'perfect_game',
    name: 'Flawless Victory',
    description: 'Win all rounds in a single game',
    emoji: '👑',
    category: 'mastery'
  },
  {
    id: 'undefeated',
    name: 'Undefeated',
    description: 'Win 10 games without losing',
    emoji: '🛡️',
    category: 'mastery',
    target: 10
  },
  {
    id: 'comeback_win',
    name: 'Comeback King',
    description: 'Win a game after being last in round 1',
    emoji: '🔄',
    category: 'mastery'
  },

  {
    id: 'hemisphere_hopper',
    name: 'Hemisphere Hopper',
    description: 'Guess in both northern and southern hemispheres',
    emoji: '🌐',
    category: 'explorer'
  },
  {
    id: 'around_the_world',
    name: 'Around the World',
    description: 'Guess locations in 20 different countries',
    emoji: '✈️',
    category: 'explorer',
    target: 20
  },
  {
    id: 'all_continents',
    name: 'Continental Conqueror',
    description: 'Guess correctly on all 7 continents',
    emoji: '🌎',
    category: 'explorer',
    target: 7
  },
  {
    id: 'water_guess',
    name: 'Mariner',
    description: 'Make 3 guesses in the ocean',
    emoji: '🌊',
    category: 'explorer',
    target: 3
  },

  {
    id: 'beat_ai_10x',
    name: 'AI Challenger',
    description: 'Beat the AI 10 times',
    emoji: '🤖',
    category: 'ai-master',
    target: 10
  },
  {
    id: 'beat_ai_50x',
    name: 'AI Nemesis',
    description: 'Beat the AI 50 times',
    emoji: '⚙️',
    category: 'ai-master',
    target: 50
  },
  {
    id: 'sniper_beat',
    name: 'Sniper',
    description: 'Beat the AI by 500+ km in 3 rounds',
    emoji: '🎯',
    category: 'ai-master',
    target: 3
  },
  {
    id: 'ai_rival',
    name: 'AI Rival',
    description: 'Beat the AI 100 times',
    emoji: '🧠',
    category: 'ai-master',
    target: 100
  },
  {
    id: 'photo_finish',
    name: 'Nail-Biter',
    description: 'Win 3 rounds by less than 5km distance',
    emoji: '🏁',
    category: 'ai-master',
    target: 3
  },
  {
    id: 'team_player',
    name: 'Team Player',
    description: 'Win 5 team games',
    emoji: '👥',
    category: 'ai-master',
    target: 5
  },

  {
    id: 'pro_photographer',
    name: 'Photo Contributor',
    description: 'Upload 10 photos',
    emoji: '📸',
    category: 'creator',
    target: 10
  },
  {
    id: 'creative_director',
    name: 'Creative Director',
    description: 'Add titles/hints to 10 photos',
    emoji: '🎬',
    category: 'creator',
    target: 10
  },
  {
    id: 'world_builder',
    name: 'World Builder',
    description: 'Upload photos from 5 different countries',
    emoji: '🗺️',
    category: 'creator',
    target: 5
  },
  {
    id: 'world_builder_plus',
    name: 'World Builder+',
    description: 'Upload photos from 12 different countries',
    emoji: '🌍',
    category: 'creator',
    target: 12
  },
  {
    id: 'world_builder_legend',
    name: 'World Builder Legend',
    description: 'Upload photos from 25 different countries',
    emoji: '🧳',
    category: 'creator',
    target: 25
  },
  {
    id: 'uploader_legend',
    name: 'Uploader Legend',
    description: 'Upload 40 photos',
    emoji: '🗂️',
    category: 'creator',
    target: 40
  },
  {
    id: 'crowd_favorite',
    name: 'Crowd Favorite',
    description: 'Have your photo get the most correct guesses in a game',
    emoji: '👏',
    category: 'creator'
  },

  {
    id: 'mind_blown',
    name: 'Mind Blown',
    description: 'Make 3 guesses that are 10,000+ km off',
    emoji: '🤯',
    category: 'fun',
    target: 3
  },
  {
    id: 'global_swing_master',
    name: 'Mind Blown Legend',
    description: 'Make 20 guesses that are 10,000+ km off',
    emoji: '🛰️',
    category: 'fun',
    target: 20
  },
  {
    id: 'reverse_psychology',
    name: 'Opposite Guess',
    description: 'Guess on the opposite side of the world 3 times',
    emoji: '🔄',
    category: 'fun',
    target: 3
  },
  {
    id: 'opposite_day',
    name: 'Opposite Day',
    description: 'Guess on the opposite side of the world 8 times',
    emoji: '🧭',
    category: 'fun',
    target: 8
  },
  {
    id: 'lightning_guess_legend',
    name: 'Lightning Legend',
    description: 'Make 40 guesses under 10 seconds',
    emoji: '⚡',
    category: 'fun',
    target: 40
  },

  {
    id: 'veteran_player',
    name: 'Veteran',
    description: 'Play 75 games',
    emoji: '🎖️',
    category: 'grand',
    target: 75
  },
  {
    id: 'games_won_35',
    name: 'Champion',
    description: 'Win 35 games',
    emoji: '🏅',
    category: 'grand',
    target: 35
  },
  {
    id: 'achievement_hunter',
    name: 'Achievement Hunter',
    description: 'Earn 30 achievements',
    emoji: '🎯',
    category: 'grand',
    target: 30
  }
];

export function getAchievementById(id: string): Achievement | undefined {
  return ALL_ACHIEVEMENTS.find(ach => ach.id === id);
}
