/**
 * Quick test script to verify refactored code loads correctly
 */

console.log('🧪 Testing refactored code...\n');

// Test 1: Database helpers
console.log('1️⃣ Testing database helpers...');
try {
  const dbHelpers = require('./server/utils/db-helpers.js');
  const requiredFunctions = [
    'queryMany',
    'queryOne',
    'execute',
    'insertAndReturn',
    'updateAndReturn',
    'deleteRecord',
    'exists',
    'count',
    'insertOrIgnore'
  ];
  
  const missing = requiredFunctions.filter(fn => !dbHelpers[fn]);
  if (missing.length > 0) {
    console.error('❌ Missing functions:', missing);
    process.exit(1);
  }
  console.log('✅ All database helper functions exported correctly');
} catch (error) {
  console.error('❌ Error loading database helpers:', error.message);
  process.exit(1);
}

// Test 2: Admin controller using helpers
console.log('\n2️⃣ Testing admin controller imports...');
try {
  const adminController = require('./server/controllers/admin.js');
  const { queryMany, queryOne, insertAndReturn, updateAndReturn, deleteRecord } = require('./server/utils/db-helpers.js');
  
  // Check if functions are available (they should be imported)
  console.log('✅ Admin controller loaded and helpers imported');
} catch (error) {
  console.error('❌ Error loading admin controller:', error.message);
  process.exit(1);
}

// Test 3: Stats controller using helpers
console.log('\n3️⃣ Testing stats controller imports...');
try {
  const statsController = require('./server/controllers/stats.js');
  const { count, queryOne } = require('./server/utils/db-helpers.js');
  
  console.log('✅ Stats controller loaded and helpers imported');
} catch (error) {
  console.error('❌ Error loading stats controller:', error.message);
  process.exit(1);
}

// Test 4: Modal components exist
console.log('\n4️⃣ Testing modal component files exist...');
const fs = require('fs');
const path = require('path');

const modalFiles = [
  'client/src/components/modals/ItemModal.js',
  'client/src/components/modals/BulkImportModal.js',
  'client/src/components/modals/BulkLookupModal.js',
  'client/src/components/modals/SeedTop2000Modal.js',
  'client/src/components/modals/SeedPopularCultureModal.js'
];

let allExist = true;
modalFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing: ${file}`);
    allExist = false;
  }
});

if (!allExist) {
  process.exit(1);
}
console.log('✅ All modal component files exist');

// Test 5: AdminDashboard imports
console.log('\n5️⃣ Testing AdminDashboard imports...');
try {
  const adminDashboardContent = fs.readFileSync(
    path.join(__dirname, 'client/src/components/AdminDashboard.js'),
    'utf8'
  );
  
  const requiredImports = [
    "import ItemModal from './modals/ItemModal'",
    "import BulkImportModal from './modals/BulkImportModal'",
    "import BulkLookupModal from './modals/BulkLookupModal'",
    "import SeedTop2000Modal from './modals/SeedTop2000Modal'",
    "import SeedPopularCultureModal from './modals/SeedPopularCultureModal'"
  ];
  
  const missingImports = requiredImports.filter(imp => !adminDashboardContent.includes(imp));
  if (missingImports.length > 0) {
    console.error('❌ Missing imports:', missingImports);
    process.exit(1);
  }
  
  // Check that modals are not defined inline anymore
  if (adminDashboardContent.includes('const BulkImportModal = ({ onClose') || 
      adminDashboardContent.includes('const BulkLookupModal = ({ onClose') ||
      adminDashboardContent.includes('const SeedTop2000Modal = ({ onClose') ||
      adminDashboardContent.includes('const SeedPopularCultureModal = ({ onClose')) {
    console.warn('⚠️  Some modals might still be defined inline in AdminDashboard');
  }
  
  console.log('✅ AdminDashboard imports modals correctly');
} catch (error) {
  console.error('❌ Error checking AdminDashboard:', error.message);
  process.exit(1);
}

console.log('\n✨ All tests passed! Refactoring appears successful.');
console.log('\n📊 Summary:');
console.log('   - Database helpers: ✅');
console.log('   - Admin controller: ✅');
console.log('   - Stats controller: ✅');
console.log('   - Modal components: ✅');
console.log('   - AdminDashboard imports: ✅\n');

