/**
 * Credits are deducted only when generation status becomes running.
 */
export interface GenerationJob {
  generation_job_id: string;
  project_id: string;
  status: "pending" | "running" | "completed" | "failed_rate_limited" | "failed_error";
  created_at: string;
}
