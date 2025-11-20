async function declension(tp) {
    const fileName = tp.file.title;

    // ============================================
    // 1. ПРОВЕРКА ИНТЕРНЕТА
    // ============================================
    async function checkInternet() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            await fetch('https://morpher.ru', { 
                method: 'HEAD', 
                mode: 'no-cors',
                signal: controller.signal 
            });
            clearTimeout(timeout);
            return true;
        } catch {
            return false;
        }
    }

    // ============================================
    // 2. API #1: МОРФЕР.РУ (основной)
    // ============================================
    async function getMorpherDeclensions(text, retryCount = 0) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(
                `https://ws3.morpher.ru/russian/declension?s=${encodeURIComponent(text)}&format=json`,
                { 
                    signal: controller.signal,
                    method: 'GET'
                }
            );
            clearTimeout(timeout);
            
            if (response.status === 429) {
                console.log('⚠️ Морфер: Too Many Requests');
                return null;
            }
            
            if (response.status === 496) {
                console.log('⚠️ Морфер: слово не найдено');
                return null;
            }
            
            if (!response.ok) {
                console.log(`⚠️ Морфер: ошибка ${response.status}`);
                
                if (retryCount === 0) {
                    console.log('🔄 Повторная попытка через 2 сек...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return getMorpherDeclensions(text, 1);
                }
                return null;
            }
            
            const data = await response.json();
            
            if (!data || typeof data !== 'object') return null;
            
            console.log('✅ Морфер: успех');
            
            return {
                singular: {
                    nominative: text,
                    genitive: data['Р'],
                    dative: data['Д'],
                    accusative: data['В'],
                    instrumental: data['Т'],
                    prepositional: data['П']
                },
                plural: data['множественное'] ? {
                    nominative: data['множественное']['И'],
                    genitive: data['множественное']['Р'],
                    dative: data['множественное']['Д'],
                    accusative: data['множественное']['В'],
                    instrumental: data['множественное']['Т'],
                    prepositional: data['множественное']['П']
                } : null
            };
        } catch (e) {
            console.log('❌ Морфер недоступен:', e.message);
            
            if (retryCount === 0) {
                console.log('🔄 Повторная попытка...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                return getMorpherDeclensions(text, 1);
            }
            return null;
        }
    }

    // ============================================
    // 3. API #2: SKLONENIE.RU (резервный)
    // ============================================
    async function getSklonenieRuDeclensions(text, retryCount = 0) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(
                `https://ws3.morpher.ru/russian/declension?s=${encodeURIComponent(text)}&format=json`,
                { 
                    signal: controller.signal,
                    method: 'GET'
                }
            );
            clearTimeout(timeout);
            
            if (response.status === 429) {
                console.log('⚠️ Sklonenie.ru: Too Many Requests');
                return null;
            }
            
            if (!response.ok) {
                console.log(`⚠️ Sklonenie.ru: ошибка ${response.status}`);
                
                if (retryCount === 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return getSklonenieRuDeclensions(text, 1);
                }
                return null;
            }
            
            const data = await response.json();
            
            if (!data) return null;
            
            console.log('✅ Sklonenie.ru: успех');
            
            return {
                singular: {
                    nominative: text,
                    genitive: data['genitive'] || data['Р'],
                    dative: data['dative'] || data['Д'],
                    accusative: data['accusative'] || data['В'],
                    instrumental: data['instrumental'] || data['Т'],
                    prepositional: data['prepositional'] || data['П']
                },
                plural: data['plural'] || data['множественное'] ? {
                    nominative: data['plural']?.['nominative'] || data['множественное']?.['И'],
                    genitive: data['plural']?.['genitive'] || data['множественное']?.['Р'],
                    dative: data['plural']?.['dative'] || data['множественное']?.['Д'],
                    accusative: data['plural']?.['accusative'] || data['множественное']?.['В'],
                    instrumental: data['plural']?.['instrumental'] || data['множественное']?.['Т'],
                    prepositional: data['plural']?.['prepositional'] || data['множественное']?.['П']
                } : null
            };
        } catch (e) {
            console.log('❌ Sklonenie.ru недоступен:', e.message);
            
            if (retryCount === 0) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return getSklonenieRuDeclensions(text, 1);
            }
            return null;
        }
    }

    // ============================================
    // 4. ОПРЕДЕЛЕНИЕ ФОРМЫ ЧИСЛА
    // ============================================
    function isPluralForm(word) {
        const lowerWord = word.toLowerCase();
        
        if (lowerWord.endsWith('ы') || lowerWord.endsWith('и')) {
            return true;
        }
        
        if (lowerWord.endsWith('ия') || lowerWord.endsWith('ья')) {
            return true;
        }
        
        return false;
    }

    function getSingularForm(word) {
        const lowerWord = word.toLowerCase();
        
        let singular = word;
        
        if (lowerWord.endsWith('ы')) {
            singular = word.slice(0, -1);
        } else if (lowerWord.endsWith('ии')) {
            singular = word.slice(0, -1) + 'я';
        } else if (lowerWord.endsWith('и')) {
            singular = word.slice(0, -1);
            singular = word.slice(0, -1) + 'а';
        } else if (lowerWord.endsWith('ия')) {
            singular = word.slice(0, -1);
        }
        
        return singular;
    }

    // ============================================
    // 5. ОФЛАЙН СКЛОНЕНИЕ
    // ============================================

    const ALTERNATIONS = {
        'к': 'ч',
        'г': 'ж', 
        'х': 'ш',
        'ц': 'ч'
    };

    function applyAlternation(stem, ending) {
        const lastChar = stem.slice(-1).toLowerCase();
        const prevChar = stem.length > 1 ? stem.slice(-2, -1).toLowerCase() : '';
        
        const vowels = ['а', 'е', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я'];
        if (vowels.includes(prevChar) && (lastChar === 'к' || lastChar === 'г')) {
            return stem;
        }
        
        if ((ending.startsWith('и') || ending.startsWith('е')) && ALTERNATIONS[lastChar]) {
            const newStem = stem.slice(0, -1) + ALTERNATIONS[lastChar];
            if (stem[0] === stem[0].toUpperCase()) {
                return newStem.charAt(0).toUpperCase() + newStem.slice(1);
            }
            return newStem;
        }
        
        return stem;
    }

    function offlineDeclension(text) {
        const words = text.split(' ');
        
        if (words.length > 1) {
            return null;
        }
        
        return declineWord(text);
    }

    function isAdjective(word) {
        const lowerWord = word.toLowerCase();
        
        if (lowerWord.endsWith('ый') || lowerWord.endsWith('ий') || lowerWord.endsWith('ой')) {
            return true;
        }
        
        if (lowerWord.endsWith('ая') || lowerWord.endsWith('яя')) {
            return true;
        }
        
        if (lowerWord.endsWith('ое') || lowerWord.endsWith('ее')) {
            return true;
        }
        
        if (lowerWord.endsWith('ые') || lowerWord.endsWith('ие')) {
            if (lowerWord.length > 4 && !lowerWord.endsWith('ние') && !lowerWord.endsWith('тие')) {
                return true;
            }
        }
        
        return false;
    }

    function declineWord(word) {
        const lowerWord = word.toLowerCase();
        
        if (isIndeclinable(word)) {
            return createSingleFormResult(word);
        }
        
        if (isAdjective(word)) {
            return declineAdjective(word);
        }
        
        if (lowerWord.endsWith('ие')) {
            return declineTypeNeuterIe(word);
        } else if (lowerWord.endsWith('а') || lowerWord.endsWith('я')) {
            return declineTypeA(word);
        } else if (lowerWord.endsWith('о') || lowerWord.endsWith('е')) {
            return declineTypeO(word);
        } else if (lowerWord.endsWith('ь')) {
            return declineTypeSoft(word);
        } else if (lowerWord.endsWith('ы') || lowerWord.endsWith('и')) {
            return declineTypePlural(word);
        } else {
            return declineTypeMasculine(word);
        }
    }

    function declineAdjective(word) {
        const lowerWord = word.toLowerCase();
        
        let gender, number;
        let stem, ending;
        
        if (lowerWord.endsWith('ый')) {
            gender = 'masculine';
            number = 'singular';
            stem = word.slice(0, -2);
            ending = 'ый';
        } else if (lowerWord.endsWith('ий')) {
            gender = 'masculine';
            number = 'singular';
            stem = word.slice(0, -2);
            ending = 'ий';
        } else if (lowerWord.endsWith('ой')) {
            gender = 'masculine';
            number = 'singular';
            stem = word.slice(0, -2);
            ending = 'ой';
        } else if (lowerWord.endsWith('ая')) {
            gender = 'feminine';
            number = 'singular';
            stem = word.slice(0, -2);
            ending = 'ая';
        } else if (lowerWord.endsWith('яя')) {
            gender = 'feminine';
            number = 'singular';
            stem = word.slice(0, -2);
            ending = 'яя';
        } else if (lowerWord.endsWith('ое')) {
            gender = 'neuter';
            number = 'singular';
            stem = word.slice(0, -2);
            ending = 'ое';
        } else if (lowerWord.endsWith('ее')) {
            gender = 'neuter';
            number = 'singular';
            stem = word.slice(0, -2);
            ending = 'ее';
        } else if (lowerWord.endsWith('ые')) {
            gender = 'plural';
            number = 'plural';
            stem = word.slice(0, -2);
            ending = 'ые';
        } else if (lowerWord.endsWith('ие')) {
            gender = 'plural';
            number = 'plural';
            stem = word.slice(0, -2);
            ending = 'ие';
        } else {
            return createSingleFormResult(word);
        }
        
        const isSoft = ending.startsWith('и') || ending.startsWith('я') || ending.startsWith('е');
        
        let singular, plural;
        
        if (gender === 'masculine') {
            singular = {
                nominative: word,
                genitive: stem + 'ого',
                dative: stem + 'ому',
                accusative: word,
                instrumental: stem + 'ым',
                prepositional: stem + 'ом'
            };
        } else if (gender === 'feminine') {
            singular = {
                nominative: word,
                genitive: stem + (isSoft ? 'ей' : 'ой'),
                dative: stem + (isSoft ? 'ей' : 'ой'),
                accusative: stem + 'ую',
                instrumental: stem + (isSoft ? 'ей' : 'ой'),
                prepositional: stem + (isSoft ? 'ей' : 'ой')
            };
        } else if (gender === 'neuter') {
            singular = {
                nominative: word,
                genitive: stem + 'ого',
                dative: stem + 'ому',
                accusative: word,
                instrumental: stem + 'ым',
                prepositional: stem + 'ом'
            };
        } else {
            singular = {
                nominative: stem + (isSoft ? 'ий' : 'ый'),
                genitive: stem + 'ого',
                dative: stem + 'ому',
                accusative: stem + (isSoft ? 'ий' : 'ый'),
                instrumental: stem + 'ым',
                prepositional: stem + 'ом'
            };
        }
        
        plural = {
            nominative: stem + (isSoft ? 'ие' : 'ые'),
            genitive: stem + 'ых',
            dative: stem + 'ым',
            accusative: stem + (isSoft ? 'ие' : 'ые'),
            instrumental: stem + 'ыми',
            prepositional: stem + 'ых'
        };
        
        return { singular, plural };
    }

    function isIndeclinable(word) {
        if (/^[А-ЯЁ]{2,}$/.test(word)) return true;
        const indeclinableWords = ['метро', 'кино', 'пальто', 'кофе', 'такси', 'шоссе', 'депо'];
        return indeclinableWords.includes(word.toLowerCase());
    }

    function createSingleFormResult(word) {
        return {
            singular: {
                nominative: word,
                genitive: word,
                dative: word,
                accusative: word,
                instrumental: word,
                prepositional: word
            },
            plural: null
        };
    }

    function declineTypeA(word) {
        const stem = word.slice(0, -1);
        const lastChar = word.slice(-1);
        const soft = lastChar === 'я';
        
        const isIya = word.toLowerCase().endsWith('ия');
        
        const stemGen = applyAlternation(stem, soft ? 'и' : 'ы');
        const stemDat = applyAlternation(stem, 'е');
        
        return {
            singular: {
                nominative: word,
                genitive: stemGen + (soft ? 'и' : 'ы'),
                dative: isIya ? stem + 'и' : stemDat + 'е',
                accusative: stem + (soft ? 'ю' : 'у'),
                instrumental: stem + (soft ? 'ей' : 'ой'),
                prepositional: isIya ? stem + 'и' : stemDat + 'е'
            },
            plural: {
                nominative: stemGen + (soft ? 'и' : 'ы'),
                genitive: isIya ? stem + 'й' : stem,
                dative: stem + 'ам',
                accusative: stemGen + (soft ? 'и' : 'ы'),
                instrumental: stem + 'ами',
                prepositional: stem + 'ах'
            }
        };
    }

    function declineTypeNeuterIe(word) {
        const stem = word.slice(0, -2);
        
        return {
            singular: {
                nominative: word,
                genitive: stem + 'ия',
                dative: stem + 'ию',
                accusative: word,
                instrumental: stem + 'ием',
                prepositional: stem + 'ии'
            },
            plural: {
                nominative: stem + 'ия',
                genitive: stem + 'ий',
                dative: stem + 'иям',
                accusative: stem + 'ия',
                instrumental: stem + 'иями',
                prepositional: stem + 'иях'
            }
        };
    }

    function declineTypeO(word) {
        const stem = word.slice(0, -1);
        
        return {
            singular: {
                nominative: word,
                genitive: stem + 'а',
                dative: stem + 'у',
                accusative: word,
                instrumental: stem + 'ом',
                prepositional: stem + 'е'
            },
            plural: {
                nominative: stem + 'а',
                genitive: stem,
                dative: stem + 'ам',
                accusative: stem + 'а',
                instrumental: stem + 'ами',
                prepositional: stem + 'ах'
            }
        };
    }

    function declineTypeMasculine(word) {
        const stem = word;
        const lastChar = word.slice(-1).toLowerCase();
        const soft = ['ж', 'ш', 'ч', 'щ', 'й'].includes(lastChar);
        
        return {
            singular: {
                nominative: word,
                genitive: stem + 'а',
                dative: stem + 'у',
                accusative: word,
                instrumental: stem + (soft ? 'ем' : 'ом'),
                prepositional: stem + 'е'
            },
            plural: {
                nominative: stem + (soft ? 'и' : 'ы'),
                genitive: stem + 'ов',
                dative: stem + 'ам',
                accusative: stem + (soft ? 'и' : 'ы'),
                instrumental: stem + 'ами',
                prepositional: stem + 'ах'
            }
        };
    }

    function declineTypeSoft(word) {
        const stem = word.slice(0, -1);
        
        return {
            singular: {
                nominative: word,
                genitive: stem + 'и',
                dative: stem + 'и',
                accusative: word,
                instrumental: stem + 'ью',
                prepositional: stem + 'и'
            },
            plural: {
                nominative: stem + 'и',
                genitive: stem + 'ей',
                dative: stem + 'ям',
                accusative: stem + 'и',
                instrumental: stem + 'ями',
                prepositional: stem + 'ях'
            }
        };
    }

    function declineTypePlural(word) {
        const singular = getSingularForm(word);
        const lowerSingular = singular.toLowerCase();
        
        if (lowerSingular.endsWith('а') || lowerSingular.endsWith('я')) {
            const singDecl = declineTypeA(singular);
            
            return {
                singular: singDecl.singular,
                plural: {
                    nominative: word,
                    genitive: word.slice(0, -1),
                    dative: word.slice(0, -1) + 'ам',
                    accusative: word,
                    instrumental: word.slice(0, -1) + 'ами',
                    prepositional: word.slice(0, -1) + 'ах'
                }
            };
        } else if (lowerSingular.endsWith('ие') || lowerSingular.endsWith('о') || lowerSingular.endsWith('е')) {
            const singDecl = lowerSingular.endsWith('ие') 
                ? declineTypeNeuterIe(singular) 
                : declineTypeO(singular);
            
            return {
                singular: singDecl.singular,
                plural: {
                    nominative: word,
                    genitive: word.slice(0, -1),
                    dative: word.slice(0, -1) + 'ам',
                    accusative: word,
                    instrumental: word.slice(0, -1) + 'ами',
                    prepositional: word.slice(0, -1) + 'ах'
                }
            };
        } else {
            return {
                singular: {
                    nominative: singular,
                    genitive: singular + 'а',
                    dative: singular + 'у',
                    accusative: singular,
                    instrumental: singular + 'ом',
                    prepositional: singular + 'е'
                },
                plural: {
                    nominative: word,
                    genitive: word.slice(0, -1) + 'ов',
                    dative: word.slice(0, -1) + 'ам',
                    accusative: word,
                    instrumental: word.slice(0, -1) + 'ами',
                    prepositional: word.slice(0, -1) + 'ах'
                }
            };
        }
    }

    function mergeAllResults(results) {
        const validResults = results.filter(r => r !== null && r !== undefined);
        
        if (validResults.length === 0) return null;
        if (validResults.length === 1) return validResults[0];
        
        const merged = { singular: {}, plural: {} };
        const cases = ['nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'prepositional'];
        
        for (const caseType of cases) {
            const singularVariants = validResults
                .filter(r => r.singular && r.singular[caseType])
                .map(r => r.singular[caseType])
                .filter(v => v && v.trim());
            
            const uniqueSingular = [...new Set(singularVariants)];
            merged.singular[caseType] = uniqueSingular.length === 1 ? uniqueSingular[0] : uniqueSingular;
            
            const pluralVariants = validResults
                .filter(r => r.plural && r.plural[caseType])
                .map(r => r.plural[caseType])
                .filter(v => v && v.trim());
            
            const uniquePlural = [...new Set(pluralVariants)];
            merged.plural[caseType] = uniquePlural.length > 0 
                ? (uniquePlural.length === 1 ? uniquePlural[0] : uniquePlural)
                : null;
        }
        
        return merged;
    }

    function extractUniqueAliases(declensions, originalTitle) {
        if (!declensions) return [];
        
        const aliases = new Set();
        
        const addForm = (form) => {
            if (!form) return;
            
            if (Array.isArray(form)) {
                form.forEach(f => {
                    if (f && f !== originalTitle && f.trim()) {
                        aliases.add(f.trim());
                    }
                });
            } else if (form !== originalTitle && form.trim()) {
                aliases.add(form.trim());
            }
        };
        
        if (declensions.singular) {
            Object.values(declensions.singular).forEach(addForm);
        }
        
        if (declensions.plural) {
            Object.values(declensions.plural).forEach(addForm);
        }
        
        return Array.from(aliases);
    }

    async function generateAliases() {
        try {
            const hasInternet = await checkInternet();
            let declensions = null;
            let needsInternet = false;
            let isOffline = false;
            
            if (hasInternet) {
                console.log('📡 Онлайн режим');
                
                let morpher = await getMorpherDeclensions(fileName);
                
                if (morpher && isPluralForm(fileName) && !morpher.singular.genitive) {
                    console.log('🔍 Запрашиваем единственное число...');
                    const singularForm = getSingularForm(fileName);
                    const morpherSingular = await getMorpherDeclensions(singularForm);
                    
                    if (morpherSingular) {
                        morpher.singular = morpherSingular.singular;
                    }
                }
                
                const sklonenie = await getSklonenieRuDeclensions(fileName);
                
                if (morpher || sklonenie) {
                    declensions = mergeAllResults([morpher, sklonenie]);
                    console.log('✅ Данные получены от API');
                } else {
                    console.log('⚠️ API недоступны → офлайн');
                    declensions = offlineDeclension(fileName);
                    isOffline = true;
                    
                    if (!declensions) {
                        needsInternet = true;
                    }
                }
                
            } else {
                console.log('📴 Офлайн режим');
                declensions = offlineDeclension(fileName);
                isOffline = true;
                
                if (!declensions) {
                    needsInternet = true;
                }
            }
            
            if (!declensions) {
                console.log('⚠️ Склонение недоступно');
                return { aliases: [], needsInternet, isOffline: false };
            }
            
            const aliases = extractUniqueAliases(declensions, fileName);
            
            console.log(`✅ Сгенерировано ${aliases.length} форм`);
            return { aliases, needsInternet: false, isOffline };
            
        } catch (error) {
            console.error('❌ Ошибка:', error);
            return { aliases: [], needsInternet: false, isOffline: false };
        }
    }

    // ============================================
    // ВЫПОЛНЕНИЕ И ВОЗВРАТ РЕЗУЛЬТАТА
    // ============================================
    const result = await generateAliases();
    const aliases = result.aliases;
    const needsInternet = result.needsInternet;
    const isOffline = result.isOffline;

    let output = '';

    if (aliases.length > 0) {
        output = `aliases: [${aliases.map(a => `"${a}"`).join(', ')}]`;
        if (isOffline) {
            output += '\n# ℹ️ Склонение выполнено офлайн (могут быть неточности)';
        }
    } else if (needsInternet) {
        output = 'aliases: []\n# ⚠️ Для склонения словосочетаний требуется подключение к интернету';
    } else {
        output = 'aliases: []';
    }

    return output;
}

module.exports = declension;