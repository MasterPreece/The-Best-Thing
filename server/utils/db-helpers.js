/**
 * Database Helper Utilities
 * Provides a unified interface for PostgreSQL and SQLite
 * Handles differences in syntax, placeholders, and function names
 */

const db = require('../database');

/**
 * Convert SQL with ? placeholders to $1, $2, ... for PostgreSQL
 * Or keep ? for SQLite
 */
const prepareSql = (sql, params = []) => {
  const dbType = db.getDbType();
  
  if (dbType === 'postgres') {
    // Replace ? with $1, $2, etc.
    let paramIndex = 1;
    const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    
    // Replace SQLite-specific functions with PostgreSQL equivalents
    return convertedSql
      .replace(/\bRANDOM\(\)/g, 'RANDOM()')
      .replace(/\bABS\(RANDOM\(\)\)/g, 'RANDOM()')
      .replace(/\bdate\((['"]?now\(\)?['"]?)\)/gi, 'CURRENT_DATE')
      .replace(/\bdate\(/gi, 'DATE(')
      .replace(/\bdatetime\(/gi, 'TIMESTAMP(')
      .replace(/\bINSERT OR IGNORE/g, 'INSERT')
      .replace(/\bINSERT OR REPLACE/g, 'INSERT');
  } else {
    // SQLite - replace PostgreSQL-specific syntax
    return sql
      .replace(/\$(\d+)/g, '?') // Convert $1, $2 back to ? (shouldn't happen, but safety)
      .replace(/\bRETURNING\s+[\w\s,]+/gi, '') // Remove RETURNING clause
      .replace(/\bON CONFLICT.*?DO NOTHING/gi, ''); // Remove ON CONFLICT (handled separately)
  }
};

/**
 * Convert SQL for SQLite-specific syntax differences
 */
const convertSqlForDb = (sql) => {
  const dbType = db.getDbType();
  
  if (dbType === 'postgres') {
    return sql
      .replace(/\bRANDOM\(\)/g, 'RANDOM()')
      .replace(/\bABS\(RANDOM\(\)\)/g, 'RANDOM()')
      .replace(/\bdate\((['"]?now\(\)?['"]?)\)/gi, 'CURRENT_DATE')
      .replace(/\bdate\(/gi, 'DATE(')
      .replace(/\bdatetime\(/gi, 'TIMESTAMP(');
  } else {
    // SQLite-specific conversions
    return sql
      .replace(/\bRANDOM\(\)/g, '(ABS(RANDOM()) % 1000000)')
      .replace(/\bCURRENT_DATE/g, "date('now')")
      .replace(/\bDATE\(/g, 'date(')
      .replace(/\bTIMESTAMP\(/g, 'datetime(');
  }
};

/**
 * Query many rows (returns array)
 */
const queryMany = async (sql, params = []) => {
  const dbType = db.getDbType();
  const convertedSql = convertSqlForDb(sql);
  
  if (dbType === 'postgres') {
    // Convert ? to $1, $2, etc.
    let paramIndex = 1;
    const pgSql = convertedSql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await db.query(pgSql, params);
    return result.rows;
  } else {
    // SQLite
    const dbInstance = db.getDb();
    return new Promise((resolve, reject) => {
      dbInstance.all(convertedSql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
};

/**
 * Query single row (returns first row or null)
 */
const queryOne = async (sql, params = []) => {
  const dbType = db.getDbType();
  const convertedSql = convertSqlForDb(sql);
  
  if (dbType === 'postgres') {
    let paramIndex = 1;
    const pgSql = convertedSql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await db.query(pgSql, params);
    return result.rows[0] || null;
  } else {
    // SQLite
    const dbInstance = db.getDb();
    return new Promise((resolve, reject) => {
      dbInstance.get(convertedSql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
};

/**
 * Execute INSERT/UPDATE/DELETE (returns { changes, lastID } or rows for RETURNING)
 */
const execute = async (sql, params = []) => {
  const dbType = db.getDbType();
  const convertedSql = convertSqlForDb(sql);
  
  if (dbType === 'postgres') {
    let paramIndex = 1;
    const pgSql = convertedSql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await db.query(pgSql, params);
    
    // If it's an INSERT/UPDATE with RETURNING, return rows
    if (sql.toUpperCase().includes('RETURNING')) {
      return {
        rows: result.rows,
        changes: result.rowCount || 0,
        lastID: result.rows[0]?.id || null
      };
    }
    
    return {
      changes: result.rowCount || 0,
      lastID: result.rows[0]?.id || null
    };
  } else {
    // SQLite
    const dbInstance = db.getDb();
    return new Promise((resolve, reject) => {
      dbInstance.run(convertedSql, params, function(err) {
        if (err) reject(err);
        else resolve({
          changes: this.changes,
          lastID: this.lastID
        });
      });
    });
  }
};

/**
 * Insert a record and return the created record (handles RETURNING differences)
 */
const insertAndReturn = async (table, data, selectFields = '*') => {
  const dbType = db.getDbType();
  const columns = Object.keys(data);
  const values = Object.values(data);
  
  if (dbType === 'postgres') {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const columnList = columns.join(', ');
    
    const sql = `
      INSERT INTO ${table} (${columnList})
      VALUES (${placeholders})
      RETURNING ${selectFields}
    `;
    
    const result = await db.query(sql, values);
    return result.rows[0] || null;
  } else {
    // SQLite: Insert, then SELECT
    const placeholders = columns.map(() => '?').join(', ');
    const columnList = columns.join(', ');
    
    const dbInstance = db.getDb();
    const insertResult = await new Promise((resolve, reject) => {
      dbInstance.run(
        `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        }
      );
    });
    
    if (insertResult.changes === 0) {
      return null;
    }
    
    // Fetch the inserted record
    const inserted = await queryOne(
      `SELECT ${selectFields} FROM ${table} WHERE id = ?`,
      [insertResult.lastID]
    );
    
    return inserted;
  }
};

/**
 * Update a record and return the updated record
 */
const updateAndReturn = async (table, id, data, selectFields = '*', idColumn = 'id') => {
  const dbType = db.getDbType();
  const columns = Object.keys(data);
  const values = Object.values(data);
  const setClause = columns.map((col, i) => {
    if (dbType === 'postgres') {
      return `${col} = $${i + 1}`;
    } else {
      return `${col} = ?`;
    }
  }).join(', ');
  
  if (dbType === 'postgres') {
    const sql = `
      UPDATE ${table}
      SET ${setClause}
      WHERE ${idColumn} = $${columns.length + 1}
      RETURNING ${selectFields}
    `;
    
    const result = await db.query(sql, [...values, id]);
    return result.rows[0] || null;
  } else {
    // SQLite: Update, then SELECT
    const dbInstance = db.getDb();
    const updateResult = await new Promise((resolve, reject) => {
      dbInstance.run(
        `UPDATE ${table} SET ${setClause} WHERE ${idColumn} = ?`,
        [...values, id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
    
    if (updateResult.changes === 0) {
      return null;
    }
    
    // Fetch the updated record
    const updated = await queryOne(
      `SELECT ${selectFields} FROM ${table} WHERE ${idColumn} = ?`,
      [id]
    );
    
    return updated;
  }
};

/**
 * Delete a record and return whether it existed
 */
const deleteRecord = async (table, id, idColumn = 'id') => {
  const dbType = db.getDbType();
  
  if (dbType === 'postgres') {
    const result = await db.query(
      `DELETE FROM ${table} WHERE ${idColumn} = $1 RETURNING ${idColumn}`,
      [id]
    );
    return result.rows.length > 0;
  } else {
    const dbInstance = db.getDb();
    const result = await new Promise((resolve, reject) => {
      dbInstance.run(
        `DELETE FROM ${table} WHERE ${idColumn} = ?`,
        [id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
    return result.changes > 0;
  }
};

/**
 * Check if a record exists
 */
const exists = async (table, whereClause, params = []) => {
  const dbType = db.getDbType();
  const sql = `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`;
  const record = await queryOne(sql, params);
  return !!record;
};

/**
 * Count records
 */
const count = async (table, whereClause = '', params = []) => {
  const dbType = db.getDbType();
  const where = whereClause ? `WHERE ${whereClause}` : '';
  const sql = `SELECT COUNT(*) as count FROM ${table} ${where}`;
  const result = await queryOne(sql, params);
  return result ? parseInt(result.count) : 0;
};

/**
 * Handle INSERT OR IGNORE / ON CONFLICT DO NOTHING
 */
const insertOrIgnore = async (table, data, conflictColumn = null) => {
  const dbType = db.getDbType();
  const columns = Object.keys(data);
  const values = Object.values(data);
  
  if (dbType === 'postgres') {
    // Determine conflict column if not provided
    if (!conflictColumn) {
      if (table === 'items') conflictColumn = 'title';
      else if (table === 'users') conflictColumn = 'email';
      // Default to id if no known unique constraint
    }
    
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const columnList = columns.join(', ');
    const conflictClause = conflictColumn 
      ? `ON CONFLICT (${conflictColumn}) DO NOTHING`
      : 'ON CONFLICT DO NOTHING';
    
    const sql = `
      INSERT INTO ${table} (${columnList})
      VALUES (${placeholders})
      ${conflictClause}
    `;
    
    const result = await db.query(sql, values);
    return { changes: result.rowCount || 0 };
  } else {
    // SQLite
    const placeholders = columns.map(() => '?').join(', ');
    const columnList = columns.join(', ');
    
    const dbInstance = db.getDb();
    return new Promise((resolve, reject) => {
      dbInstance.run(
        `INSERT OR IGNORE INTO ${table} (${columnList}) VALUES (${placeholders})`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }
};

module.exports = {
  queryMany,
  queryOne,
  execute,
  insertAndReturn,
  updateAndReturn,
  deleteRecord,
  exists,
  count,
  insertOrIgnore,
  prepareSql,
  convertSqlForDb
};

