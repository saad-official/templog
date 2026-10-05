import { ApiError } from '@/data';

/** Plain-language message for a team / account API failure. */
export function teamErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "Can't reach Templog right now. Check the connection and try again.";
    switch (error.code) {
      case 'kitchen_not_found':
        return 'No kitchen uses that code. Check it with whoever shared it.';
      case 'own_kitchen':
        return "That's your own kitchen's code. Share it with your staff instead.";
      case 'kitchen_full':
        return 'That kitchen is full. Ask the owner to remove someone first.';
      case 'not_a_member':
        return "You're no longer a member of that kitchen.";
    }
    if (error.status === 401) return 'Please sign in again.';
    if (error.status === 403) return 'Only the kitchen owner can do that.';
    return error.message || 'Something went wrong. Please try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
