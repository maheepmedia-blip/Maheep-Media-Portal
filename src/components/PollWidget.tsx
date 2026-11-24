import { CheckCircle2, Vote } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PollItem } from '../types/news.ts';

export function PollWidget() {
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [votedIds, setVotedIds] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('maheep_voted_polls') || '{}');
    } catch {
      return {};
    }
  });
  const [busyId, setBusyId] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    fetch('/api/polls')
      .then((r) => r.json())
      .then((json) => setPolls(json.polls || []))
      .catch(() => {});
  }, []);

  if (polls.length === 0) return null;

  const submitVote = async (pollId: string, optionId: string) => {
    setBusyId(pollId);
    setFeedback('');
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: optionId }),
      });
      const json = await res.json();
      if (res.ok) {
        setPolls((prev) =>
          prev.map((p) => (p.id === pollId ? { ...p, options: json.options, totalVotes: json.totalVotes } : p)),
        );
        const nextVoted = { ...votedIds, [pollId]: optionId };
        setVotedIds(nextVoted);
        localStorage.setItem('maheep_voted_polls', JSON.stringify(nextVoted));
      } else {
        setFeedback(json.error || 'Could not record vote.');
        if (res.status === 409) {
          const nextVoted = { ...votedIds, [pollId]: optionId };
          setVotedIds(nextVoted);
          localStorage.setItem('maheep_voted_polls', JSON.stringify(nextVoted));
        }
      }
    } catch {
      setFeedback('Network error submitting vote.');
    } finally {
      setBusyId('');
    }
  };

  const poll = polls[0];
  const hasVoted = Boolean(votedIds[poll.id]);
  const total = Math.max(1, poll.totalVotes);

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 bg-white dark:bg-neutral-900 space-y-3">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Vote className="w-4 h-4 text-[#00652E] dark:text-[#4ade80]" />
          <h2 className="font-editorial text-lg font-bold text-neutral-950 dark:text-white">Reader Poll</h2>
        </div>
        <span className="text-[11px] font-medium text-neutral-500">{poll.category}</span>
      </div>

      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">{poll.question}</p>

      <div className="space-y-2">
        {poll.options.map((opt) => {
          const pct = poll.totalVotes > 0 ? Math.round((opt.votes / total) * 100) : 0;
          const isChosen = votedIds[poll.id] === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={hasVoted || busyId === poll.id}
              onClick={() => submitVote(poll.id, opt.id)}
              className={`w-full text-left rounded border p-2.5 transition-colors relative overflow-hidden ${
                isChosen
                  ? 'border-[#00652E] bg-[#EAF5E5]/60 dark:bg-[#00451F]/30'
                  : 'border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]/60'
              } disabled:cursor-default`}
            >
              {hasVoted && (
                <div
                  className="absolute inset-y-0 left-0 bg-[#00652E]/10 dark:bg-[#4ade80]/15 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                  {isChosen && <CheckCircle2 className="w-3.5 h-3.5 text-[#00652E] dark:text-[#4ade80] shrink-0" />}
                  {opt.label}
                </span>
                {hasVoted && (
                  <span className="font-mono-tabular font-bold text-[#00652E] dark:text-[#4ade80] shrink-0">
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {feedback && <p className="text-[11px] text-amber-700 dark:text-amber-400">{feedback}</p>}

      <div className="text-[11px] text-neutral-500 font-mono-tabular pt-1">
        {poll.totalVotes} {poll.totalVotes === 1 ? 'reader response' : 'reader responses'}
        {hasVoted ? ' · Thank you for participating' : ' · Select an option to vote'}
      </div>
    </div>
  );
}
