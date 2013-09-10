package model;

public class Coord_Curso_Prof {

	private int professor_id;
	private int curso_id;
	private int coordenador_id;
	private String semestre;
	private int ano;
	
	public int getProfessor_id() {
		return professor_id;
	}
	public void setProfessor_id(int professor_id) {
		this.professor_id = professor_id;
	}
	public int getCurso_id() {
		return curso_id;
	}
	public void setCurso_id(int curso_id) {
		this.curso_id = curso_id;
	}
	public int getCoordenador_id() {
		return coordenador_id;
	}
	public void setCoordenador_id(int coordenador_id) {
		this.coordenador_id = coordenador_id;
	}
	public String getSemestre() {
		return semestre;
	}
	public void setSemestre(String semestre) {
		this.semestre = semestre;
	}
	public int getAno() {
		return ano;
	}
	public void setAno(int ano) {
		this.ano = ano;
	}
}
