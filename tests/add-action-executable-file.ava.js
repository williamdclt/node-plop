import fs from 'fs';
import co from 'co';
import path from 'path';
import AvaTest from './_base-ava-test';
const {test, mockPath, testSrcPath, nodePlop} = (new AvaTest(__filename));

const plop = nodePlop();

/////
//
//

test('Add action keeps the executable flag', co.wrap(function* (t) {
	plop.setGenerator('addExecutable', {
		actions: [{
			type: 'add',
			path: `${testSrcPath}/added.sh`,
			templateFile: `${mockPath}/add.sh`
		}]
	});

	yield plop.getGenerator('addExecutable').runActions();
	const srcStats = fs.statSync(`${mockPath}/add.sh`)
	const destStats = fs.statSync(`${testSrcPath}/added.sh`)
	t.is(srcStats.mode, destStats.mode);
}));
