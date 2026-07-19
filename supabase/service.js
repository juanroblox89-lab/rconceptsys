/**
 * Supabase Service Wrapper - Creative Production OS
 * Drop-in replacement for firebase/service.js
 *
 * Exports the same API surface (dbService, authService, storageService, db, increment)
 * so existing services and pages work without changes.
 */
import { supabase, MASTER_ADMIN_EMAILS, BUCKETS } from './client.js';

// Re-export supabase client as `db` (replaces Firestore `db` import)
export { supabase as db, supabase };

/**
 * increment() helper - mirrors Firebase's increment.
 * In Supabase we use raw SQL via rpc or pass the delta in JS.
 * Here we return a marker object consumed by dbService.update.
 */
export const increment = (n = 1) => ({ __increment: n });

/**
 * Generic Database Service
 * Mirrors the Firebase dbService API (getAll, getById, getByQuery, add, set, update, delete, batch)
 */
export const dbService = {
  async getAll(collectionName) {
    try {
      const { data, error } = await supabase.from(collectionName).select('*');
      if (error) throw error;
      return (data || []).map((row) => ({ id: row.id, ...row }));
    } catch (error) {
      console.error(`Error fetching ${collectionName}:`, error);
      throw error;
    }
  },

  async getById(collectionName, id) {
    try {
      const { data, error } = await supabase
        .from(collectionName)
        .select('*')
        .eq('id', id)
        .single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data ? { id: data.id, ...data } : null;
    } catch (error) {
      console.error(`Error fetching ${collectionName}/${id}:`, error);
      throw error;
    }
  },

  async getByQuery(collectionName, field, operator, value) {
    try {
      let query = supabase.from(collectionName).select('*');
      // Map Firebase operators to Supabase PostgREST operators
      switch (operator) {
        case '==':
          query = query.eq(field, value);
          break;
        case '!=':
          query = query.neq(field, value);
          break;
        case '>':
          query = query.gt(field, value);
          break;
        case '>=':
          query = query.gte(field, value);
          break;
        case '<':
          query = query.lt(field, value);
          break;
        case '<=':
          query = query.lte(field, value);
          break;
        case 'in':
          query = query.in(field, value);
          break;
        case 'array-contains':
          query = query.contains(field, [value]);
          break;
        default:
          query = query.eq(field, value);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row) => ({ id: row.id, ...row }));
    } catch (error) {
      console.error(`Error querying ${collectionName}:`, error);
      throw error;
    }
  },

  async add(collectionName, data) {
    try {
      const payload = {
        ...data,
        createdAt: new Date().toISOString(),
      };
      const { data: inserted, error } = await supabase
        .from(collectionName)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return inserted?.id;
    } catch (error) {
      console.error(`Error adding to ${collectionName}:`, error);
      throw error;
    }
  },

  async set(collectionName, id, data) {
    try {
      const payload = {
        id,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      const { error } = await supabase
        .from(collectionName)
        .upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      return id;
    } catch (error) {
      console.error(`Error setting doc ${collectionName}/${id}:`, error);
      throw error;
    }
  },

  async update(collectionName, id, data) {
    try {
      // Handle increment markers
      const payload = { ...data, updatedAt: new Date().toISOString() };
      const { data: updated, error } = await supabase
        .from(collectionName)
        .update(payload)
        .eq('id', id)
        .select('id');
      if (error) throw error;
      // Fix #8: Warn if no rows were actually updated (likely wrong id)
      if (!updated || updated.length === 0) {
        console.warn(`[DB] update('${collectionName}', '${String(id).slice(0, 12)}...') matched 0 rows — possible id/uid mismatch`);
      }
    } catch (error) {
      console.error(`Error updating ${collectionName}/${id}:`, error);
      throw error;
    }
  },

  async delete(collectionName, id) {
    try {
      const { error } = await supabase.from(collectionName).delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error(`Error deleting ${collectionName}/${id}:`, error);
      throw error;
    }
  },

  /**
   * Batch operations - Supabase doesn't have writeBatch, but we emulate it
   * by running inserts in parallel within a transaction-like block.
   */
  batch() {
    const ops = [];
    return {
      set(ref, data, options) {
        // Fix #4: Correctly extract collection name from ref._collection
        const collection = ref?._collection || options?.collection || null;
        if (!collection) {
          console.error('[Batch] Missing collection name in set() call. ref:', ref, 'data.id:', data?.id);
        }
        ops.push({ type: 'upsert', collection, data, options });
      },
      update(ref, data) {
        ops.push({ type: 'update', ref, data });
      },
      delete(ref) {
        ops.push({ type: 'delete', ref });
      },
      async commit() {
        // Execute all ops sequentially (Supabase has no native batch)
        let errors = 0;
        for (const op of ops) {
          if (op.type === 'upsert' && op.collection) {
            const { error } = await supabase
              .from(op.collection)
              .upsert({ ...op.data, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
            if (error) {
              console.warn(`Batch upsert error on ${op.collection}:`, error);
              errors++;
            }
          } else if (op.type === 'upsert' && !op.collection) {
            console.error('[Batch] Skipping upsert with no collection for data:', op.data?.id);
            errors++;
          }
        }
        if (errors > 0) {
          console.warn(`[Batch] Committed with ${errors} error(s) out of ${ops.length} operations`);
        }
        return { errors, total: ops.length };
      },
    };
  },
};

/**
 * Auth Service
 * Mirrors Firebase authService API (onAuthChange, loginWithGoogle, login, logout, getFreshUserDoc)
 */
export const authService = {
  // Mutex lock to prevent concurrent _processUser executions (Fix #3)
  _processing: false,
  _lastProcessedAuthId: null,

  /**
   * Subscribe to auth state changes.
   * @param {(user: object|null) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onAuthChange(callback) {
    let initialized = false;

    // Single source of truth: onAuthStateChange handles everything
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log(`[Auth] Event: ${_event}, session: ${session ? 'yes' : 'no'}`);

        // Deduplicate: skip if we already processed this exact auth user
        const currentAuthId = session?.user?.id || null;
        if (_event === 'SIGNED_IN' && initialized && currentAuthId === this._lastProcessedAuthId) {
          console.log('[Auth] Duplicate SIGNED_IN for same user, skipping');
          return;
        }

        // Skip initial null session if we haven't confirmed there's no session yet
        if (!initialized && _event === 'INITIAL_SESSION' && !session) {
          // Double-check with getSession before showing login
          const { data: { session: doubleCheck } } = await supabase.auth.getSession();
          if (doubleCheck) {
            console.log('[Auth] Double-check found session, using it');
            await this._processUser(doubleCheck.user, callback);
          } else {
            console.log('[Auth] No session after double-check');
            initialized = true;
            callback(null);
          }
          return;
        }
        initialized = true;
        await this._processUser(session?.user || null, callback);
      }
    );

    // Return unsubscribe function (mirrors Firebase API)
    return () => listener.subscription.unsubscribe();
  },

  async _processUser(authUser, callback) {
    if (!authUser) {
      this._lastProcessedAuthId = null;
      this._processing = false;
      callback(null);
      return;
    }

    // Mutex: prevent concurrent execution (Fix #3)
    if (this._processing) {
      console.log('[Auth] _processUser already running, skipping duplicate call');
      return;
    }
    this._processing = true;

    const normalizedEmail = (authUser.email || '').toLowerCase();
    const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(normalizedEmail);

    try {
      // 1. Search user by uid column
      let { data: userData, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('uid', authUser.id)
        .maybeSingle();

      if (userErr) throw userErr;

      let userDoc = userData;

      // 2. Fallback: Search by email if not found by uid (for migrated Firebase accounts)
      if (!userDoc && authUser.email) {
        const { data: emailData, error: emailErr } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email.toLowerCase())
          .maybeSingle();

        if (emailErr) throw emailErr;

        if (emailData) {
          // Found by email. Update their uid column to match the new Supabase Auth UID.
          const { data: updatedData, error: updateErr } = await supabase
            .from('users')
            .update({ uid: authUser.id })
            .eq('id', emailData.id)
            .select()
            .single();

          if (updateErr) throw updateErr;
          userDoc = updatedData;
          console.log(`[Auth] Self-healed user UID for email ${authUser.email}`);
        }
      }

      if (!userDoc) {
        // Create new user profile (mirrors Firebase auto-create flow)
        const newUser = {
          id: authUser.id,
          uid: authUser.id,
          nombre:
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            authUser.email?.split('@')[0] ||
            'Usuario',
          email: authUser.email,
          photoURL: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || '',
          createdAt: new Date().toISOString(),
          approved: isMasterAdmin,
          role: isMasterAdmin ? 'admin' : 'viewer',
        };
        await dbService.set('users', authUser.id, newUser);
        this._lastProcessedAuthId = authUser.id;
        this._processing = false;
        callback(newUser);
      } else {
        this._lastProcessedAuthId = authUser.id;
        this._processing = false;
        callback(userDoc);
      }
    } catch (err) {
      console.warn('Supabase access error fetching user, using master fallback:', err);
      this._lastProcessedAuthId = authUser.id;
      this._processing = false;
      callback({
        uid: authUser.id,
        id: authUser.id,
        nombre:
          authUser.user_metadata?.full_name ||
          authUser.email?.split('@')[0] ||
          'Usuario',
        email: authUser.email,
        photoURL: authUser.user_metadata?.avatar_url || '',
        role: isMasterAdmin ? 'admin' : 'viewer',
        approved: isMasterAdmin,
        _isFallback: true,  // Flag to indicate this is a fallback object
      });
    }
  },

  async loginWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  },

  async login(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  async getFreshUserDoc(uid) {
    // Fix #5: Search by 'uid' column, not 'id' column.
    // The 'uid' param here is the Supabase Auth UID, which is stored in users.uid (text),
    // NOT in users.id (uuid PK). dbService.getById filters by .eq('id', ...) which fails
    // for migrated users where id ≠ uid.
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('uid', uid)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, ...data } : null;
    } catch (err) {
      console.error(`Error fetching fresh user doc for uid ${uid}:`, err);
      return null;
    }
  },

  async logout() {
    return await supabase.auth.signOut();
  },
};

/**
 * Storage Service
 * Mirrors Firebase storageService API (uploadFile, getLogoUrl, deleteFile)
 */
export const storageService = {
  async uploadFile(path, file) {
    try {
      // Determine bucket from path prefix
      const bucket = path.startsWith('logos/') ? BUCKETS.LOGOS : BUCKETS.ASSETS;
      // Strip bucket prefix from path if present
      const cleanPath = path.replace(/^(assets|logos)\//, '');

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(cleanPath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      // Return signed URL (1 hour expiry)
      const { data: urlData, error: urlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(data.path, 3600);

      if (urlError) throw urlError;
      return urlData.signedUrl;
    } catch (err) {
      console.error('Supabase Storage upload error:', err);
      throw new Error('No se pudo subir el archivo: ' + err.message);
    }
  },

  async getSignedUrl(path) {
    try {
      const bucket = path.startsWith('logos/') ? BUCKETS.LOGOS : BUCKETS.ASSETS;
      const cleanPath = path.replace(/^(assets|logos)\//, '');

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(cleanPath, 3600);

      if (error) throw error;
      return data.signedUrl;
    } catch (err) {
      return null;
    }
  },

  async getLogoUrl() {
    return this.getSignedUrl('logos/rohlfing-concept-logo.jpg');
  },

  async deleteFile(path) {
    try {
      const bucket = path.startsWith('logos/') ? BUCKETS.LOGOS : BUCKETS.ASSETS;
      const cleanPath = path.replace(/^(assets|logos)\//, '');

      const { error } = await supabase.storage.from(bucket).remove([cleanPath]);
      if (error) throw error;
      console.log(`[Storage] Deleted file successfully: ${path}`);
      return true;
    } catch (err) {
      console.error(`Supabase Storage deletion error for path ${path}:`, err);
      return false;
    }
  },
};

export default { db: supabase, dbService, authService, storageService, increment };
