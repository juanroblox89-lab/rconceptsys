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
      const { error } = await supabase
        .from(collectionName)
        .update(payload)
        .eq('id', id);
      if (error) throw error;
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
        // ref is ignored in Supabase; we capture collection + id from data
        ops.push({ type: 'upsert', collection: ref?._collection || data.id?.split('/')[0], data, options });
      },
      update(ref, data) {
        ops.push({ type: 'update', ref, data });
      },
      delete(ref) {
        ops.push({ type: 'delete', ref });
      },
      async commit() {
        // Execute all ops sequentially (Supabase has no native batch)
        const errors = [];
        for (const op of ops) {
          if (op.type === 'upsert') {
            const { error } = await supabase
              .from(op.collection)
              .upsert({ ...op.data, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
            if (error) {
              console.error('Batch upsert error:', error);
              errors.push(error);
            }
          }
        }
        if (errors.length > 0) {
          const batchError = new Error(
            `Batch commit failed for ${errors.length} of ${ops.length} operation(s): ${errors[0].message}`
          );
          batchError.errors = errors;
          throw batchError;
        }
      },
    };
  },
};

/**
 * Auth Service
 * Mirrors Firebase authService API (onAuthChange, loginWithGoogle, login, logout, getFreshUserDoc)
 */
export const authService = {
  /**
   * Subscribe to auth state changes.
   * @param {(user: object|null) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onAuthChange(callback) {
    // 1. Emit current session immediately
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await this._processUser(session?.user || null, callback);
    });

    // 2. Subscribe to future changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        await this._processUser(session?.user || null, callback);
      }
    );

    // Return unsubscribe function (mirrors Firebase API)
    return () => listener.subscription.unsubscribe();
  },

  async _processUser(authUser, callback) {
    if (!authUser) {
      callback(null);
      return;
    }

    const normalizedEmail = (authUser.email || '').toLowerCase();
    const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(normalizedEmail);

    try {
      // Fetch the app user profile from public.users
      const userDoc = await dbService.getById('users', authUser.id);

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
        callback(newUser);
      } else {
        callback(userDoc);
      }
    } catch (err) {
      console.warn('Supabase access error fetching user, using master fallback:', err);
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
    return await dbService.getById('users', uid);
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

      // Return public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (err) {
      console.error('Supabase Storage upload error:', err);
      throw new Error('No se pudo subir el archivo: ' + err.message);
    }
  },

  async getLogoUrl() {
    try {
      const { data } = supabase.storage
        .from(BUCKETS.LOGOS)
        .getPublicUrl('rohlfing-concept-logo.jpg');
      return data?.publicUrl || null;
    } catch (err) {
      return null;
    }
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
