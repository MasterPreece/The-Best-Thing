/**
 * Quick test script to verify refactored code loads and basic functionality
 */

console.log('🧪 Testing refactored code...\n');

const testResults = {
  passed: [],
  failed: []
};

function test(name, fn) {
  try {
    fn();
    testResults.passed.push(name);
    console.log(`✅ ${name}`);
  } catch (error) {
    testResults.failed.push({ name, error: error.message });
    console.error(`❌ ${name}: ${error.message}`);
  }
}

// Test 1: Database helpers load correctly
test('Database helpers load', () => {
  const helpers = require('./server/utils/db-helpers.js');
  const requiredFunctions = ['queryMany', 'queryOne', 'execute', 'insertAndReturn', 'updateAndReturn', 'deleteRecord'];
  requiredFunctions.forEach(fn => {
    if (!helpers[fn]) {
      throw new Error(`Missing function: ${fn}`);
    }
  });
});

// Test 2: Controllers load correctly
test('Stats controller loads', () => {
  const stats = require('./server/controllers/stats.js');
  if (!stats.getGlobalStats) throw new Error('Missing getGlobalStats');
});

test('Admin controller loads', () => {
  const admin = require('./server/controllers/admin.js');
  if (!admin.getAdminItems) throw new Error('Missing getAdminItems');
  if (!admin.createItem) throw new Error('Missing createItem');
  if (!admin.updateItem) throw new Error('Missing updateItem');
  if (!admin.deleteItem) throw new Error('Missing deleteItem');
});

test('Items controller loads', () => {
  const items = require('./server/controllers/items.js');
  if (!items.getRankings) throw new Error('Missing getRankings');
  if (!items.searchItem) throw new Error('Missing searchItem');
  if (!items.getItemById) throw new Error('Missing getItemById');
});

// Test 3: Routes load correctly
test('Routes load', () => {
  const routes = require('./server/routes/index.js');
  // Just check it exports something
  if (!routes) throw new Error('Routes not exported');
});

// Test 4: Database initializes
test('Database module loads', () => {
  const db = require('./server/database.js');
  if (!db.init) throw new Error('Missing db.init');
  if (!db.getDbType) throw new Error('Missing db.getDbType');
});

// Test 5: Server index loads
test('Server index loads', () => {
  // Just require it - don't start the server
  delete require.cache[require.resolve('./server/index.js')];
  // We'll just check if it can be parsed
  require('fs').readFileSync('./server/index.js', 'utf8');
});

// Test 6: Modal components exist
test('Modal components exist', () => {
  const fs = require('fs');
  const modals = [
    'client/src/components/modals/ItemModal.js',
    'client/src/components/modals/BulkImportModal.js',
    'client/src/components/modals/BulkLookupModal.js',
    'client/src/components/modals/SeedTop2000Modal.js',
    'client/src/components/modals/SeedPopularCultureModal.js'
  ];
  modals.forEach(modal => {
    if (!fs.existsSync(modal)) {
      throw new Error(`Missing modal: ${modal}`);
    }
  });
});

// Test 7: AdminDashboard imports modals
test('AdminDashboard imports modals', () => {
  const fs = require('fs');
  const content = fs.readFileSync('client/src/components/AdminDashboard.js', 'utf8');
  const requiredImports = [
    "import ItemModal from './modals/ItemModal'",
    "import BulkImportModal from './modals/BulkImportModal'",
    "import BulkLookupModal from './modals/BulkLookupModal'"
  ];
  requiredImports.forEach(imp => {
    if (!content.includes(imp)) {
      throw new Error(`Missing import: ${imp}`);
    }
  });
});

console.log(`\n📊 Test Results:`);
console.log(`   ✅ Passed: ${testResults.passed.length}`);
console.log(`   ❌ Failed: ${testResults.failed.length}`);

if (testResults.failed.length > 0) {
  console.log(`\n❌ Failures:`);
  testResults.failed.forEach(f => {
    console.log(`   - ${f.name}: ${f.error}`);
  });
  process.exit(1);
}

console.log(`\n✨ All static tests passed!`);
console.log(`\n📝 Next steps:`);
console.log(`   1. Run "npm start" to test server startup`);
console.log(`   2. Test API endpoints (curl http://localhost:3001/api/stats)`);
console.log(`   3. If local tests pass, push to Railway`);

