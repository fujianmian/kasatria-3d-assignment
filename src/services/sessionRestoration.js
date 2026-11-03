export const FALLBACK_PROFILE = Object.freeze({ name: 'Google account', email: '' });

export async function restoreAuthorizedSession({ accessToken, googleSession, loadPeople }) {
  const profilePromise = googleSession.getUserProfile(accessToken)
    .then((profile) => ({ profile, profileError: null }))
    .catch((error) => {
      if (error?.code === 'UNAUTHORIZED') throw error;
      return { profile: FALLBACK_PROFILE, profileError: error };
    });
  const peoplePromise = loadPeople({ accessToken });
  const [profileResult, people] = await Promise.all([profilePromise, peoplePromise]);

  if (people.length !== 200) {
    throw new Error(`Expected 200 people records but received ${people.length}.`);
  }

  return { profile: profileResult.profile, people, profileError: profileResult.profileError };
}
