import { CommentItem } from "../types";

// Comprehensive set of English stop words to filter out grammatical noise
const STOP_WORDS = new Set([
  "the", "a", "and", "is", "of", "to", "in", "it", "that", "this", "for", "with", "on", "was", "as", "at", "by", "an", "be", "are", "have", "you", "my", "we", "they", "i", "really", "very", "would", "just", "get", "so", "but", "not", "can", "or", "your", "me", "out", "about", "more", "all", "there", "has", "if", "from", "when", "up", "one", "some", "like", "do", "how", "about", "good", "bad", "great", "excellent", "extremely", "unbearable", "huge", "highly", "much", "too", "so", "new", "old", "first", "last", "will", "than", "then", "into", "their", "them", "these", "other", "there's", "been", "wasn't", "don't", "couldn't", "can't", "did", "didn't", "going", "she", "he", "his", "her", "who", "what", "which", "where", "why", "how's", "only", "even", "also", "any", "some", "our", "us", "no", "yes", "off", "again", "then", "once", "here", "there", "about", "very", "too", "just", "quite", "more", "most", "some", "any", "such", "own", "other", "same", "than", "too", "very", "s", "t", "can", "will", "just", "should", "now", "d", "ll", "m", "o", "re", "ve", "y", "ain", "aren", "couldn", "didn", "doesn", "hadn", "hasn", "haven", "isn", "ma", "mightn", "mustn", "needn", "shan", "shouldn", "wasn", "weren", "won", "wouldn"
]);

// Cleans punctuation and splits into lowercase words
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'\n\r]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// Capitalizes words for presentation
function capitalize(str: string): string {
  if (!str) return "";
  return str
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Extracts the 2 most meaningful, non-stop words from a comment to form a micro-topic
function extractMicroTopic(text: string): string {
  const words = tokenize(text);
  if (words.length >= 2) {
    return capitalize(`${words[0]} & ${words[1]}`);
  } else if (words.length === 1) {
    return capitalize(words[0]);
  }
  return "General Feedback";
}

/**
 * Dynamically clusters comments based on their actual text content.
 * Identifies high-frequency terms and bigrams, designates them as primary clusters,
 * and classifies comments into them, falling back to local phrase-extraction to prevent hallucinations.
 */
export function clusterCommentsDynamically(comments: CommentItem[]): CommentItem[] {
  if (comments.length === 0) return [];

  // 1. If very few comments are present, assign them hyper-local topics directly to prevent sterile clusters
  if (comments.length < 5) {
    return comments.map(c => {
      const topic = extractMicroTopic(c.text);
      return { ...c, topic };
    });
  }

  // 2. Count unigram (single word) and bigram (word pair) frequencies
  const unigramCounts: Record<string, number> = {};
  const bigramCounts: Record<string, number> = {};

  comments.forEach(c => {
    const tokens = tokenize(c.text);
    
    // Count unigrams
    tokens.forEach(token => {
      unigramCounts[token] = (unigramCounts[token] || 0) + 1;
    });

    // Count bigrams
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i+1]}`;
      bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
    }
  });

  // 3. Select top bigrams that are highly repeated
  const candidateBigrams = Object.entries(bigramCounts)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([phrase]) => phrase);

  // 4. Select top unigrams to supplement
  const candidateUnigrams = Object.entries(unigramCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([word]) => {
      // Avoid words that are part of selected bigrams to keep them distinct
      return !candidateBigrams.some(bigram => bigram.includes(word));
    })
    .slice(0, 6)
    .map(([word]) => word);

  // Combine into a candidate list of primary topic themes (up to 6)
  const primaryCandidates = [...candidateBigrams, ...candidateUnigrams].slice(0, 6);

  // Map each primary candidate to a clean capitalized Topic Name
  const topicMap = primaryCandidates.map(theme => ({
    raw: theme,
    formatted: capitalize(theme)
  }));

  // 5. Assign each comment to its best fitting topic
  return comments.map(c => {
    const textLower = c.text.toLowerCase();
    
    // Try to match a primary cluster theme
    let matchedTheme = null;
    let maxScore = -1;

    for (const theme of topicMap) {
      if (textLower.includes(theme.raw)) {
        // Scoring: bigrams get higher weight, otherwise count occurrences or position
        const score = theme.raw.includes(" ") ? 10 : 5;
        if (score > maxScore) {
          maxScore = score;
          matchedTheme = theme.formatted;
        }
      }
    }

    // Fallback: If no primary cluster matched, extract an authentic micro-topic from the text itself
    const assignedTopic = matchedTheme || extractMicroTopic(c.text);

    return {
      ...c,
      topic: assignedTopic
    };
  });
}
