import { ChatMessage, GenerationJob, GeneratedImage } from '../types';

const simulateDelay = () => new Promise(resolve => setTimeout(resolve, 1000));

const DESIGNER_REPLIES = [
  "Understood — I'm refining the direction.",
  "Great context. Let me think about how to translate that visually.",
  "I'm starting to see a clear visual language forming here.",
  "Interesting choices. I have some strong ideas taking shape.",
  "That helps a lot. I think we're ready to explore some concepts.",
];

let messageCount = 0;

export interface DesignerReply {
  message: ChatMessage;
  canCreateVisuals: boolean;
}

export async function sendChatMessage(message: ChatMessage): Promise<DesignerReply> {
  await simulateDelay();
  messageCount++;

  const replyIndex = Math.min(messageCount - 1, DESIGNER_REPLIES.length - 1);
  const canCreateVisuals = messageCount >= 3;

  return {
    message: {
      chat_message_id: crypto.randomUUID(),
      project_id: message.project_id,
      sender: "designer",
      content: DESIGNER_REPLIES[replyIndex],
      created_at: new Date().toISOString()
    },
    canCreateVisuals,
  };
}

export async function uploadImageReference(_file: File): Promise<string> {
  await simulateDelay();
  return `https://example.com/uploads/${crypto.randomUUID()}`;
}

export async function startGeneration(project_id: string): Promise<{ job: GenerationJob; images?: GeneratedImage[] }> {
  await new Promise(resolve => setTimeout(resolve, 2500));
  
  const isRateLimited = Math.random() < 0.1;
  
  if (isRateLimited) {
    return {
      job: {
        generation_job_id: crypto.randomUUID(),
        project_id,
        status: 'failed_rate_limited',
        created_at: new Date().toISOString()
      }
    };
  }

  const job: GenerationJob = {
    generation_job_id: crypto.randomUUID(),
    project_id,
    status: 'completed',
    created_at: new Date().toISOString()
  };

  const images: GeneratedImage[] = [
    {
      generated_image_id: crypto.randomUUID(),
      project_id,
      url: `https://picsum.photos/seed/${crypto.randomUUID()}/1024/1024`,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      generated_image_id: crypto.randomUUID(),
      project_id,
      url: `https://picsum.photos/seed/${crypto.randomUUID()}/1024/1024`,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    }
  ];

  return { job, images };
}
