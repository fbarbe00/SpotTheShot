import type { Achievement } from './achievementTypes';

export const ALL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_game',
    name: 'First Steps',
    description: 'Complete your first game',
    emoji: '🎮',
    category: 'getting-started'
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
    id: 'far_guesses',
    name: 'Global Swing',
    description: 'Make a guess over 10,000km away 3 times',
    emoji: '🌏',
    category: 'fun',
    target: 3
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
    id: 'reverse_psychology',
    name: 'Opposite Guess',
    description: 'Guess on the opposite side of the world 3 times',
    emoji: '🔄',
    category: 'fun',
    target: 3
  },
  {
    id: 'global_swing_master',
    name: 'Global Swing Master',
    description: 'Make 20 guesses over 10,000km away',
    emoji: '🛰️',
    category: 'fun',
    target: 20
  },
  {
    id: 'mind_blown_chain',
    name: 'Mind-Blown Chain',
    description: 'Make 15 guesses that are 10,000+ km off',
    emoji: '💥',
    category: 'fun',
    target: 15
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
    id: 'games_won_50',
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
