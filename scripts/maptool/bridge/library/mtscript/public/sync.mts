[h: 'Один обмен с DM Cockpit, Q17. Зовёт окно моста bridge.html раз в секунду, в macro.args объект с полем rev - номер последнего применённого вида. Туда - id, имя и клетка каждого токена текущей карты. Обратно - вид стола, хиты и состояния по id токена. Тот же номер вида - перерисовывать нечего. Токены с актёрами сопоставляет стол, а не этот макрос. Вывод макроса - только итоговый JSON, его читает окно.']
[h: url = "http://localhost:5180/vtt/maptool/sync"]
[h: lastRev = ""]
[h, if(json.type(macro.args) == "OBJECT"): lastRev = json.get(macro.args, "rev")]

[h: ids = getTokens("json")]
[h: tokens = "[]"]
[h, foreach(id, ids), code: {
  [h: tokens = json.append(tokens, json.set("{}", "id", id, "name", getName(id), "x", getTokenX(0, id), "y", getTokenY(0, id)))]
}]
[h: body = json.set("{}", "map", getCurrentMapName(), "tokens", tokens)]
[h: resp = REST.post(url, body, "application/json")]

[h: 'Нет связи или стол отказал - REST.post отдаёт объект с полем error, а не падает. Окно показывает причину и ждёт.']
[h: failed = json.contains(resp, "error")]
[h, if(failed), code: {
  [h: out = json.set("{}", "ok", 0, "rev", lastRev, "error", json.get(resp, "error"))]
};{
  [h: rev = json.get(resp, "rev")]
  [h: applied = 0]
  [h, if(rev != lastRev), code: {
    [h: known = getTokenStates("json")]
    [h: bars = json.path.read(getInfo("campaign"), "$.bars.*[*].name")]
    [h: hasHealth = json.contains(bars, "Health")]
    [h: managed = json.get(resp, "managed")]
    [h, foreach(v, json.get(resp, "tokens")), code: {
      [h: id = json.get(v, "tokenId")]
      [h, if(findToken(id) != ""), code: {
        [h: hp = json.get(v, "hp")]
        [h: cur = json.get(hp, "current")]
        [h: mx = json.get(hp, "max")]
        [h: tmp = json.get(hp, "temp")]
        [h, if(hasHealth && mx > 0): setBar("Health", max(0, min(1, cur / mx)), id)]
        [h: setLabel(cur + "/" + mx + if(tmp > 0, " +" + tmp, ""), id)]
        [h: on = json.get(v, "states")]
        [h, foreach(st, managed), code: {
          [h, if(json.contains(known, st)): setState(st, if(json.contains(on, st), 1, 0), id)]
        }]
        [h: applied = applied + 1]
      }]
    }]
  }]
  [h: out = json.set("{}", "ok", 1, "rev", rev, "tokens", json.length(tokens), "applied", applied)]
}]
[r: out]
