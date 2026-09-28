import { Check, AlertCircle, XCircle, ChevronDown } from "lucide-react";
import type { Job } from "../../shared/types";
const labels: Record<Job["kind"], string> = {
  import: "Video import",
  download: "YouTube download",
  transcribe: "Local transcription",
  export: "Video render",
  reframe: "Face framing",
  model: "Model installation",
  preview: "Browser preview",
  suggest: "AI clip analysis",
  "social-copy": "Social copy generation",
  publish: "Postiz submission",
  stream: "Stream planning",
  autopost: "Stream auto-publishing",
};
export function JobHistory({ jobs }: { jobs: Job[] }) {
  const finished = jobs
    .filter((j) => !["queued", "running"].includes(j.status))
    .slice(0, 8);
  if (!finished.length) return null;
  return (
    <details className="job-history">
      <summary>
        Recent activity <span>{finished.length}</span>
        <ChevronDown size={15} />
      </summary>
      <div>
        {finished.map((job) => (
          <div className={`history-row history-${job.status}`} key={job.id}>
            {job.status === "completed" ? (
              <Check size={16} />
            ) : job.status === "failed" ? (
              <AlertCircle size={16} />
            ) : (
              <XCircle size={16} />
            )}
            <div>
              <strong>
                {job.label || labels[job.kind]} <span>{job.status}</span>
              </strong>
              <p>
                {job.status === "completed"
                  ? job.kind === "publish" ? "Accepted by Postiz. Check its calendar for publishing status." : "Finished processing"
                  : job.message}
              </p>
            </div>
            <time dateTime={job.finishedAt || job.createdAt}>
              {new Date(job.finishedAt || job.createdAt).toLocaleTimeString(
                [],
                { hour: "2-digit", minute: "2-digit" },
              )}
            </time>
          </div>
        ))}
      </div>
    </details>
  );
}
